import { computeDifferenceMap, srgbCartesian, srgbCartesianSq, ColorPaletteMode, ColorDifferenceMethod } from "./colorDifference";
import { Stroke, type Point } from "./Stroke";
import { clamp, randBetween, randBetweenExponential } from "./util";

export type StrokePoint = {
    x: number;
    y: number;
};

const hexToRgb = (hex: string) => {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
    };
};

export class BrushOptimizer {
    private readonly context: CanvasRenderingContext2D;
    private readonly width: number;
    private readonly height: number;

    private readonly iterationsPerFrame: number;
    private readonly brushRadiusRange: [number, number];
    private readonly strokeLengthRange: [number, number];
    private readonly colorJitter: number;
    private readonly alphaRange: [number, number];
    private readonly onStatusChange?: (text: string) => void;

    private colorPaletteMode: ColorPaletteMode;
    private colorDifferenceMethod: ColorDifferenceMethod;
    private colorPalette: string[];

    private readonly referenceData: ImageData;

    private currentData: ImageData;
    private differenceMap: Float32Array;
    private totalDifference = 0;
    private nIteration = 0;

    private nBrushstroke = 0;

    private running = false;
    private frameHandle: number | null = null;

    private currentStroke: Stroke | null = null;
    private lastSuccessfulStroke: Stroke | null = null;
    private backgroundData: ImageData | null = null;
    private lastCost = 0;
    private optimizationSteps = 0;
    private readonly maxOptimizationSteps = 1_000;
    private readonly convergenceThresholdFactor = 30; // cost change threshold per pixel of radius
    private nHatchesRemaining = 0;


    constructor(options: {
        ctx: CanvasRenderingContext2D;
        referenceBitmap: ImageBitmap;
        iterationsPerFrame?: number;
        brushRadiusRange?: [number, number];
        colorJitter?: number;
        alphaRange?: [number, number];
        strokeLengthRange?: [number, number];
        onStatusChange?: (text: string) => void;
        onErr?: (text: string) => void;
        colorPaletteMode?: ColorPaletteMode;
        colorDifferenceMethod?: ColorDifferenceMethod;
        colorPalette?: string[];
    }) {
        this.context = options.ctx;
        this.onStatusChange = options.onStatusChange;
        this.colorPaletteMode = options.colorPaletteMode ?? ColorPaletteMode.Any;
        this.colorDifferenceMethod = options.colorDifferenceMethod ?? ColorDifferenceMethod.Distance;
        this.colorPalette = options.colorPalette ?? [];

        this.iterationsPerFrame = options.iterationsPerFrame ?? 1;
        this.brushRadiusRange = options.brushRadiusRange ?? [1, 400];
        this.strokeLengthRange = options.strokeLengthRange ?? [2, 16];
        this.colorJitter = options.colorJitter ?? 9;
        this.alphaRange = options.alphaRange ?? [0.8, 1];

        this.width = options.referenceBitmap.width;
        this.height = options.referenceBitmap.height;

        this.context.imageSmoothingEnabled = true;
        this.context.save();
        this.context.fillStyle = "#ffffff";
        this.context.globalAlpha = 1;
        this.context.fillRect(0, 0, this.width, this.height);
        this.context.restore();

        const referenceCanvas = document.createElement("canvas");
        referenceCanvas.width = this.width;
        referenceCanvas.height = this.height;
        const referenceCtx = referenceCanvas.getContext("2d");
        if (!referenceCtx) {
            options.onErr?.("Unable to create reference canvas context");
            throw new Error("Unable to create reference canvas context");
        }
        referenceCtx.drawImage(options.referenceBitmap, 0, 0, this.width, this.height);
        this.referenceData = referenceCtx.getImageData(0, 0, this.width, this.height);

        this.currentData = this.context.getImageData(0, 0, this.width, this.height);
        this.differenceMap = new Float32Array(this.width * this.height);
        this.recomputeDifferenceMap();
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.loop();
    }

    stop() {
        this.running = false;
        if (this.frameHandle !== null) {
            cancelAnimationFrame(this.frameHandle);
            this.frameHandle = null;
        }
    }

    destroy() {
        this.stop();
    }

    setColorMode(mode: ColorPaletteMode, palette: string[]) {
        this.colorPaletteMode = mode;
        this.colorPalette = palette;
    }

    private loop = () => {
        if (!this.running) return;

        if (this.currentStroke === null) {
            const success = this.startNewStroke();
            if (!success) {
                this.stop();
                this.onStatusChange?.("Optimization complete");
                return;
            }
        } else {
            for (let i = 0; i < this.iterationsPerFrame; i++) {
                this.optimizeStroke();
            }
        }

        this.frameHandle = requestAnimationFrame(this.loop);
    };

    private startNewStroke(): boolean {
        if (this.totalDifference <= 1e-3) return false;

        if (this.nHatchesRemaining > 0 && this.lastSuccessfulStroke) {
            this.backgroundData = this.context.getImageData(0, 0, this.width, this.height);
            const candidateStroke = this.generateParallelStroke(this.lastSuccessfulStroke);

            
            this.currentStroke = candidateStroke;
            this.lastCost = this.calculateCostWithStroke(candidateStroke);
            this.nHatchesRemaining--;
            return true;
        }

        const target = this.pickTargetPixel();

        if (!target) return false;

        this.nBrushstroke++;

        this.backgroundData = this.context.getImageData(0, 0, this.width, this.height);

        // Select the best of N candidates to optimize
        const N_CANDIDATES = 100;
        let bestStroke: Stroke | null = null;
        let bestCost = Infinity;

        for (let i = 0; i < N_CANDIDATES; i++) {
            let candidateStroke: Stroke;
            
            // 30% chance to try a variation of the last successful stroke
            if (this.lastSuccessfulStroke && Math.random() < 0.7) {
                if (Math.random() < 0.5) {
                    candidateStroke = this.perturbStroke(this.lastSuccessfulStroke);
                } else {
                    candidateStroke = this.generateConnectedStroke(this.lastSuccessfulStroke);
                }
            } else {
                let r, g, b;
                
                if (this.colorPaletteMode === ColorPaletteMode.Specified && this.colorPalette.length > 0) {
                    const randomColor = this.colorPalette[Math.floor(Math.random() * this.colorPalette.length)];
                    const rgb = hexToRgb(randomColor);
                    r = rgb.r + randBetween(-this.colorJitter, this.colorJitter);
                    g = rgb.g + randBetween(-this.colorJitter, this.colorJitter);
                    b = rgb.b + randBetween(-this.colorJitter, this.colorJitter);
                } else {
                    const sampled = this.sampleReferenceColor(target.index);
                    r = sampled.r;
                    g = sampled.g;
                    b = sampled.b;
                }

                const color = this.colorPaletteMode === ColorPaletteMode.Specified 
                    ? { r, g, b }
                    : this.randomizeColor(r, g, b);

                const points = this.buildStrokePoints(target.x, target.y);
                
                candidateStroke = new Stroke({
                    p0: points[0],
                    p1: points[1],
                    p2: points[2],
                    color,
                    alpha: randBetween(this.alphaRange[0], this.alphaRange[1])
                });



            }

            const cost = this.calculateCostWithStroke(candidateStroke);
            if (cost < bestCost) {
                bestCost = cost;
                bestStroke = candidateStroke;
            }
        }

        if (bestStroke === null) return false;

        this.currentStroke = bestStroke;
        this.optimizationSteps = 0;
        this.lastCost = bestCost;
        
        // Randomly decide to start a hatching sequence
        if (Math.random() < 0.3) {
            this.nHatchesRemaining = Math.floor(randBetween(2, 5));
        }

        return true;
    }


    private optimizeStroke() {
        if (!this.currentStroke || !this.backgroundData) return;

        const posLearningRateBase = 0.00000001; // Tunable
        const radiusLearningRate = 0.0000005;
        const colorLearningRate = 0.000002;
        const alphaLearningRate = 0.000005;
        const epsilon = 1;
        const alphaEpsilon = 0.01;

        // Parameters to optimize: p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, r0, r1, r2, r, g, b, alpha
        const currentParams = new Stroke(this.currentStroke);
        
        // Calculate bounding box for local cost computation
        // Include margin for epsilon and stroke width
        const maxRadius = Math.max(this.currentStroke.p0.radius, this.currentStroke.p1.radius, this.currentStroke.p2.radius);
        const margin = maxRadius + epsilon + 2;
        const minX = Math.min(currentParams.p0.x, currentParams.p1.x, currentParams.p2.x) - margin;
        const minY = Math.min(currentParams.p0.y, currentParams.p1.y, currentParams.p2.y) - margin;
        const maxX = Math.max(currentParams.p0.x, currentParams.p1.x, currentParams.p2.x) + margin;
        const maxY = Math.max(currentParams.p0.y, currentParams.p1.y, currentParams.p2.y) + margin;
        
        const bbox = {
            x: Math.floor(clamp(minX, 0, this.width)),
            y: Math.floor(clamp(minY, 0, this.height)),
            w: 0,
            h: 0
        };
        bbox.w = Math.ceil(clamp(maxX - bbox.x, 0, this.width - bbox.x));
        bbox.h = Math.ceil(clamp(maxY - bbox.y, 0, this.height - bbox.y));

        if (bbox.w <= 0 || bbox.h <= 0) return;

        // const perturbations: Stroke[] = [];
        // perturbations.push(new Stroke({ ...currentParams, p0: { ...currentParams.p0, x: currentParams.p0.x + epsilon * currentParams.p0.radius**0.65 } }));
        // perturbations.push(new Stroke({ ...currentParams, p0: { ...currentParams.p0, y: currentParams.p0.y + epsilon * currentParams.p0.radius**0.65 } }));
        // perturbations.push(new Stroke({ ...currentParams, p1: { ...currentParams.p1, x: currentParams.p1.x + epsilon * currentParams.p1.radius**0.65 } }));
        // perturbations.push(new Stroke({ ...currentParams, p1: { ...currentParams.p1, y: currentParams.p1.y + epsilon * currentParams.p1.radius**0.65 } }));
        // perturbations.push(new Stroke({ ...currentParams, p2: { ...currentParams.p2, x: currentParams.p2.x + epsilon * currentParams.p2.radius**0.65 } }));
        // perturbations.push(new Stroke({ ...currentParams, p2: { ...currentParams.p2, y: currentParams.p2.y + epsilon * currentParams.p2.radius**0.65 } }));
        
        // perturbations.push(new Stroke({ ...currentParams, p0: { ...currentParams.p0, radius: currentParams.p0.radius + epsilon } }));
        // perturbations.push(new Stroke({ ...currentParams, p1: { ...currentParams.p1, radius: currentParams.p1.radius + epsilon } }));
        // perturbations.push(new Stroke({ ...currentParams, p2: { ...currentParams.p2, radius: currentParams.p2.radius + epsilon } }));
        
        // perturbations.push(new Stroke({ ...currentParams, color: { ...currentParams.color, r: currentParams.color.r + epsilon } }));
        // perturbations.push(new Stroke({ ...currentParams, color: { ...currentParams.color, g: currentParams.color.g + epsilon } }));
        // perturbations.push(new Stroke({ ...currentParams, color: { ...currentParams.color, b: currentParams.color.b + epsilon } }));
        
        // perturbations.push(new Stroke({ ...currentParams, alpha: currentParams.alpha + alphaEpsilon }));

        const localBaseCost = this.calculateCostWithStroke(currentParams, bbox);

        const evaluate = (mod: Partial<typeof currentParams>) => {
            const tempStroke = new Stroke({ ...currentParams, ...mod });
            tempStroke.p0.radius = clamp(tempStroke.p0.radius, this.brushRadiusRange[0], this.brushRadiusRange[1]);
            tempStroke.p1.radius = clamp(tempStroke.p1.radius, this.brushRadiusRange[0], this.brushRadiusRange[1]);
            tempStroke.p2.radius = clamp(tempStroke.p2.radius, this.brushRadiusRange[0], this.brushRadiusRange[1]);
            return this.calculateCostWithStroke(tempStroke, bbox);
        };

        const grads = {
            p0x: (evaluate({ p0: { x: currentParams.p0.x + epsilon * currentParams.p0.radius * 0.25, y: currentParams.p0.y, radius: currentParams.p0.radius } }) - localBaseCost) / (epsilon * currentParams.p0.radius * 0.25),
            p0y: (evaluate({ p0: { x: currentParams.p0.x, y: currentParams.p0.y + epsilon * currentParams.p0.radius * 0.25, radius: currentParams.p0.radius } }) - localBaseCost) / (epsilon * currentParams.p0.radius * 0.25),
            p1x: (evaluate({ p1: { x: currentParams.p1.x + epsilon * currentParams.p1.radius * 0.25, y: currentParams.p1.y, radius: currentParams.p1.radius } }) - localBaseCost) / (epsilon * currentParams.p1.radius * 0.25),
            p1y: (evaluate({ p1: { x: currentParams.p1.x, y: currentParams.p1.y + epsilon * currentParams.p1.radius * 0.25, radius: currentParams.p1.radius } }) - localBaseCost) / (epsilon * currentParams.p1.radius * 0.25),
            p2x: (evaluate({ p2: { x: currentParams.p2.x + epsilon * currentParams.p2.radius * 0.25, y: currentParams.p2.y, radius: currentParams.p2.radius } }) - localBaseCost) / (epsilon * currentParams.p2.radius * 0.25),
            p2y: (evaluate({ p2: { x: currentParams.p2.x, y: currentParams.p2.y + epsilon * currentParams.p2.radius * 0.25, radius: currentParams.p2.radius } }) - localBaseCost) / (epsilon * currentParams.p2.radius * 0.25),
            r0: (evaluate({ p0: { ...currentParams.p0, radius: currentParams.p0.radius + epsilon } }) - localBaseCost) / epsilon,
            r1: (evaluate({ p1: { ...currentParams.p1, radius: currentParams.p1.radius + epsilon } }) - localBaseCost) / epsilon,
            r2: (evaluate({ p2: { ...currentParams.p2, radius: currentParams.p2.radius + epsilon } }) - localBaseCost) / epsilon,
            r: (evaluate({ color: { ...currentParams.color, r: currentParams.color.r + epsilon } }) - localBaseCost) / epsilon,
            g: (evaluate({ color: { ...currentParams.color, g: currentParams.color.g + epsilon } }) - localBaseCost) / epsilon,
            b: (evaluate({ color: { ...currentParams.color, b: currentParams.color.b + epsilon } }) - localBaseCost) / epsilon,
            alpha: (evaluate({ alpha: currentParams.alpha + alphaEpsilon }) - localBaseCost) / alphaEpsilon
        };

        const avgRadius = (this.currentStroke.p0.radius + this.currentStroke.p1.radius + this.currentStroke.p2.radius) / 3;
        const posLearningRate = posLearningRateBase * avgRadius / this.currentStroke.alpha;
        this.currentStroke.p0.x -= grads.p0x * posLearningRate;
        this.currentStroke.p0.y -= grads.p0y * posLearningRate;
        this.currentStroke.p1.x -= grads.p1x * posLearningRate;
        this.currentStroke.p1.y -= grads.p1y * posLearningRate;
        this.currentStroke.p2.x -= grads.p2x * posLearningRate;
        this.currentStroke.p2.y -= grads.p2y * posLearningRate;
        this.currentStroke.p0.radius -= grads.r0 * radiusLearningRate;
        this.currentStroke.p1.radius -= grads.r1 * radiusLearningRate;
        this.currentStroke.p2.radius -= grads.r2 * radiusLearningRate;
        
        if (this.colorPaletteMode !== ColorPaletteMode.Specified) {
            this.currentStroke.color.r -= grads.r * colorLearningRate;
            this.currentStroke.color.g -= grads.g * colorLearningRate;
            this.currentStroke.color.b -= grads.b * colorLearningRate;
        }

        this.currentStroke.alpha -= grads.alpha * alphaLearningRate;

        this.currentStroke.p0.radius = clamp(this.currentStroke.p0.radius, this.brushRadiusRange[0], this.brushRadiusRange[1]);
        this.currentStroke.p1.radius = clamp(this.currentStroke.p1.radius, this.brushRadiusRange[0], this.brushRadiusRange[1]);
        this.currentStroke.p2.radius = clamp(this.currentStroke.p2.radius, this.brushRadiusRange[0], this.brushRadiusRange[1]);
        this.currentStroke.color.r = clamp(this.currentStroke.color.r, 0, 255);
        this.currentStroke.color.g = clamp(this.currentStroke.color.g, 0, 255);
        this.currentStroke.color.b = clamp(this.currentStroke.color.b, 0, 255);
        this.currentStroke.alpha = clamp(this.currentStroke.alpha, this.alphaRange[0], this.alphaRange[1]);

        const newLocalCost = this.calculateCostWithStroke(this.currentStroke, bbox);
        const costChange = localBaseCost - newLocalCost;
        const newGlobalCost = this.lastCost - costChange;

        this.lastCost = newGlobalCost;
        this.optimizationSteps++;

        this.drawStrokeToCanvas(this.currentStroke);

        this.onStatusChange?.(
            `Brushstroke ${this.nBrushstroke} · Step ${this.optimizationSteps} · Cost ${newGlobalCost.toFixed(0)}`
        );

        const convergenceThreshold = avgRadius * this.convergenceThresholdFactor;
        if (this.optimizationSteps >= this.maxOptimizationSteps || (Math.abs(costChange) < convergenceThreshold && this.optimizationSteps > 2)) {
            this.finalizeStroke();
        }
    }

    private finalizeStroke() {
        if (!this.currentStroke || !this.backgroundData) return;

        if (this.lastCost > this.totalDifference) {
            // the stroke made it worse, discard it
            this.context.putImageData(this.backgroundData, 0, 0);
            this.currentStroke = null;
            this.backgroundData = null;
            return;
        }
        
        this.drawStrokeToCanvas(this.currentStroke);
        
        this.lastSuccessfulStroke = new Stroke(this.currentStroke);

        this.currentData = this.context.getImageData(0, 0, this.width, this.height);
        this.recomputeDifferenceMap();
        this.nIteration++;
        
        this.currentStroke = null;
        this.backgroundData = null;
    }

    private drawStrokeToCanvas(stroke: Stroke) {
        if (!this.backgroundData) return;
        
        this.context.putImageData(this.backgroundData, 0, 0);
        
        stroke.draw(this.context);
    }

    private calculateCostWithStroke(
        stroke: Stroke, 
        bbox?: { x: number, y: number, w: number, h: number }
    ): number {
        this.drawStrokeToCanvas(stroke);
        
        const bx = bbox ? bbox.x : 0;
        const by = bbox ? bbox.y : 0;
        const bw = bbox ? bbox.w : this.width;
        const bh = bbox ? bbox.h : this.height;

        const currentPatch = this.context.getImageData(bx, by, bw, bh);
        
        let cost = 0;
        const refData = this.referenceData.data;
        const curData = currentPatch.data;
        
        if (this.colorDifferenceMethod === ColorDifferenceMethod.Contrast) {
            for (let y = 0; y < bh - 1; y++) {
                for (let x = 0; x < bw - 1; x++) {
                    const globalX = bx + x;
                    const globalY = by + y;
                    const globalIdx = (globalY * this.width + globalX) * 4;
                    const localIdx = (y * bw + x) * 4;

                    const refIdxX = globalIdx + 4;
                    const refIdxY = globalIdx + this.width * 4;

                    const refDrX = refData[refIdxX] - refData[globalIdx];
                    const refDgX = refData[refIdxX + 1] - refData[globalIdx + 1];
                    const refDbX = refData[refIdxX + 2] - refData[globalIdx + 2];

                    const refDrY = refData[refIdxY] - refData[globalIdx];
                    const refDgY = refData[refIdxY + 1] - refData[globalIdx + 1];
                    const refDbY = refData[refIdxY + 2] - refData[globalIdx + 2];

                    const curIdxX = localIdx + 4;
                    const curIdxY = localIdx + bw * 4;

                    const curDrX = curData[curIdxX] - curData[localIdx];
                    const curDgX = curData[curIdxX + 1] - curData[localIdx + 1];
                    const curDbX = curData[curIdxX + 2] - curData[localIdx + 2];

                    const curDrY = curData[curIdxY] - curData[localIdx];
                    const curDgY = curData[curIdxY + 1] - curData[localIdx + 1];
                    const curDbY = curData[curIdxY + 2] - curData[localIdx + 2];

                    const dGradRx = refDrX - curDrX;
                    const dGradGx = refDgX - curDgX;
                    const dGradBx = refDbX - curDbX;

                    const dGradRy = refDrY - curDrY;
                    const dGradGy = refDgY - curDgY;
                    const dGradBy = refDbY - curDbY;

                    cost += (dGradRx * dGradRx + dGradGx * dGradGx + dGradBx * dGradBx) +
                            (dGradRy * dGradRy + dGradGy * dGradGy + dGradBy * dGradBy);
                }
            }
        } else {
            for (let y = 0; y < bh; y++) {
                for (let x = 0; x < bw; x++) {
                    const globalX = bx + x;
                    const globalY = by + y;
                    const globalIdx = (globalY * this.width + globalX) * 4;
                    const localIdx = (y * bw + x) * 4;
                    
                    const dr = refData[globalIdx] - curData[localIdx];
                    const dg = refData[globalIdx + 1] - curData[localIdx + 1];
                    const db = refData[globalIdx + 2] - curData[localIdx + 2];
                    
                    cost += srgbCartesianSq(dr, dg, db);
                }
            }
        }
        return cost;
    }

    private pickTargetPixel(): { x: number; y: number; index: number } | null {
        if (this.totalDifference <= 0) {
            return null;
        }

        const targetValue = Math.random() * this.totalDifference;
        let accumulator = 0;
        for (let i = 0; i < this.differenceMap.length; i += 1) {
            accumulator += this.differenceMap[i];
            if (accumulator >= targetValue) {
                const x = i % this.width;
                const y = Math.floor(i / this.width);
                return { x, y, index: i };
            }
        }

        return null;
    }

    private buildStrokePoints(originX: number, originY: number): [Point, Point, Point] {
        const angle = Math.random() * Math.PI * 2;
        const jitter = this.brushRadiusRange[0] * 0.75;
        const length = randBetweenExponential(this.strokeLengthRange[0], this.strokeLengthRange[1])

        const p0 = {
            x: originX, 
            y: originY, 
            radius: randBetweenExponential(this.brushRadiusRange[0], this.brushRadiusRange[1]) 
        };
        const p1 = {
            x: clamp(
                originX + Math.cos(angle) * length * p0.radius + randBetween(-jitter, jitter),
                0,
                this.width,
            ),
            y: clamp(
                originY + Math.sin(angle) * length * p0.radius + randBetween(-jitter, jitter),
                0,
                this.height,
            ),
            radius: randBetweenExponential(this.brushRadiusRange[0], this.brushRadiusRange[1]),
        };
        const p2 = {
            x: clamp(originX + Math.cos(angle) * length * p1.radius + randBetween(-jitter, jitter), 0, this.width),
            y: clamp(originY + Math.sin(angle) * length * p1.radius + randBetween(-jitter, jitter), 0, this.height),
            radius: randBetweenExponential(this.brushRadiusRange[0], this.brushRadiusRange[1]),
        };

        return [p0, p1, p2];
    }

    private perturbStroke(stroke: Stroke): Stroke {
        const posJitter = 10;
        const radiusJitter = 2;
        const colorJitter = 10;
        const alphaJitter = 0.1;

        const perturbPoint = (p: Point): Point => ({
            x: clamp(p.x + randBetween(-posJitter, posJitter), 0, this.width),
            y: clamp(p.y + randBetween(-posJitter, posJitter), 0, this.height),
            radius: clamp(p.radius + randBetween(-radiusJitter, radiusJitter), this.brushRadiusRange[0], this.brushRadiusRange[1])
        });

        return new Stroke({
            p0: perturbPoint(stroke.p0),
            p1: perturbPoint(stroke.p1),
            p2: perturbPoint(stroke.p2),
            color: {
                r: clamp(stroke.color.r + randBetween(-colorJitter, colorJitter), 0, 255),
                g: clamp(stroke.color.g + randBetween(-colorJitter, colorJitter), 0, 255),
                b: clamp(stroke.color.b + randBetween(-colorJitter, colorJitter), 0, 255)
            },
            alpha: clamp(stroke.alpha + randBetween(-alphaJitter, alphaJitter), this.alphaRange[0], this.alphaRange[1])
        });


    }



    private generateConnectedStroke(refStroke: Stroke): Stroke {
        const basePoint = Math.random() < 0.5 ? refStroke.p0 : refStroke.p2;
        
        const posJitter = 5;
        const radiusJitter = 2;
        const colorJitter = 10;
        const alphaJitter = 0.1;

        const startX = clamp(basePoint.x + randBetween(-posJitter, posJitter), 0, this.width);
        const startY = clamp(basePoint.y + randBetween(-posJitter, posJitter), 0, this.height);
        
        const baseRadius = basePoint.radius;
        const newRadius = clamp(baseRadius + randBetween(-radiusJitter, radiusJitter), this.brushRadiusRange[0], this.brushRadiusRange[1]);

        const angle = Math.random() * Math.PI * 2;
        const length = randBetweenExponential(this.strokeLengthRange[0], this.strokeLengthRange[1]);
        const controlJitter = this.brushRadiusRange[0] * 0.75;

        const p0 = {
            x: startX,
            y: startY,
            radius: newRadius
        };

        const p1 = {
            x: clamp(startX + Math.cos(angle) * length * newRadius + randBetween(-controlJitter, controlJitter), 0, this.width),
            y: clamp(startY + Math.sin(angle) * length * newRadius + randBetween(-controlJitter, controlJitter), 0, this.height),
            radius: clamp(newRadius + randBetween(-radiusJitter, radiusJitter), this.brushRadiusRange[0], this.brushRadiusRange[1])
        };

        const p2 = {
            x: clamp(startX + Math.cos(angle) * length * p1.radius + randBetween(-controlJitter, controlJitter), 0, this.width),
            y: clamp(startY + Math.sin(angle) * length * p1.radius + randBetween(-controlJitter, controlJitter), 0, this.height),
            radius: clamp(newRadius + randBetween(-radiusJitter, radiusJitter), this.brushRadiusRange[0], this.brushRadiusRange[1])
        };

        // Inherit color with jitter
        const color = {
            r: clamp(refStroke.color.r + randBetween(-colorJitter, colorJitter), 0, 255),
            g: clamp(refStroke.color.g + randBetween(-colorJitter, colorJitter), 0, 255),
            b: clamp(refStroke.color.b + randBetween(-colorJitter, colorJitter), 0, 255)
        };

        return new Stroke({
            p0,
            p1,
            p2,
            color,
            alpha: clamp(refStroke.alpha + randBetween(-alphaJitter, alphaJitter), this.alphaRange[0], this.alphaRange[1])
        });
    }

    private generateParallelStroke(refStroke: Stroke): Stroke {
        const spacing = 3;
        
        const dx = refStroke.p2.x - refStroke.p0.x;
        const dy = refStroke.p2.y - refStroke.p0.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        let nx = 0, ny = 0;
        if (len > 0) {
            nx = -dy / len;
            ny = dx / len;
        } else {
            nx = 1; ny = 0;
        }

        const avgRadius = (refStroke.p0.radius + refStroke.p1.radius + refStroke.p2.radius) / 3;

        const offset = spacing + randBetween(-avgRadius * 2, avgRadius * 2);
        
        const offsetX = nx * offset;
        const offsetY = ny * offset;

        const p0 = {
            x: clamp(refStroke.p0.x + offsetX, 0, this.width),
            y: clamp(refStroke.p0.y + offsetY, 0, this.height),
            radius: refStroke.p0.radius,
        };
        const p1 = {
            x: clamp(refStroke.p1.x + offsetX, 0, this.width),
            y: clamp(refStroke.p1.y + offsetY, 0, this.height),
            radius: refStroke.p1.radius,
        };
        const p2 = {
            x: clamp(refStroke.p2.x + offsetX, 0, this.width),
            y: clamp(refStroke.p2.y + offsetY, 0, this.height),
            radius: refStroke.p2.radius,
        };

        return new Stroke({
            p0,
            p1,
            p2,
            color: refStroke.color,
            alpha: refStroke.alpha
        });
    }

    private recomputeDifferenceMap() {
        if (this.colorDifferenceMethod === ColorDifferenceMethod.Contrast) {
            let total = 0;
            const refData = this.referenceData.data;
            const curData = this.currentData.data;
            const out = this.differenceMap;

            out.fill(0);

            for (let y = 0; y < this.height - 1; y++) {
                for (let x = 0; x < this.width - 1; x++) {
                    const i = y * this.width + x;
                    const base = i * 4;

                    const refIdxX = base + 4;
                    const refIdxY = base + this.width * 4;

                    const refDrX = refData[refIdxX] - refData[base];
                    const refDgX = refData[refIdxX + 1] - refData[base + 1];
                    const refDbX = refData[refIdxX + 2] - refData[base + 2];

                    const refDrY = refData[refIdxY] - refData[base];
                    const refDgY = refData[refIdxY + 1] - refData[base + 1];
                    const refDbY = refData[refIdxY + 2] - refData[base + 2];

                    const curIdxX = base + 4;
                    const curIdxY = base + this.width * 4;

                    const curDrX = curData[curIdxX] - curData[base];
                    const curDgX = curData[curIdxX + 1] - curData[base + 1];
                    const curDbX = curData[curIdxX + 2] - curData[base + 2];

                    const curDrY = curData[curIdxY] - curData[base];
                    const curDgY = curData[curIdxY + 1] - curData[base + 1];
                    const curDbY = curData[curIdxY + 2] - curData[base + 2];

                    const dGradRx = refDrX - curDrX;
                    const dGradGx = refDgX - curDgX;
                    const dGradBx = refDbX - curDbX;

                    const dGradRy = refDrY - curDrY;
                    const dGradGy = refDgY - curDgY;
                    const dGradBy = refDbY - curDbY;

                    const diff = (dGradRx * dGradRx + dGradGx * dGradGx + dGradBx * dGradBx) +
                                 (dGradRy * dGradRy + dGradGy * dGradGy + dGradBy * dGradBy);
                    
                    out[i] = diff;
                    total += diff;
                }
            }
            this.totalDifference = total;
        } else {
            this.totalDifference = computeDifferenceMap({
                reference: this.referenceData.data,
                current: this.currentData.data,
                out: this.differenceMap,
                distance: srgbCartesianSq,
            });
        }
    }

    private sampleReferenceColor(pixelIndex: number): { r: number; g: number; b: number } {

        const base = pixelIndex * 4;
        const data = this.referenceData.data;
        return {
            r: data[base],
            g: data[base + 1],
            b: data[base + 2],
        };
    }

    private randomizeColor(r: number, g: number, b: number) {
        const jitter = this.colorJitter;
        return {
            r: Math.round(clamp(r + randBetween(-jitter, jitter), 0, 255)),
            g: Math.round(clamp(g + randBetween(-jitter, jitter), 0, 255)),
            b: Math.round(clamp(b + randBetween(-jitter, jitter), 0, 255)),
        };
    }
}

