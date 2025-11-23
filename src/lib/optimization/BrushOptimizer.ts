import { computeDifferenceMap, srgbCartesian, srgbCartesianSq } from "./colorDifference";
import { Stroke, type Point } from "./Stroke";
import { clamp, randBetween, randBetweenExponential } from "./util";

export type StrokePoint = {
    x: number;
    y: number;
};
export class BrushOptimizer {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly width: number;
    private readonly height: number;

    private readonly iterationsPerFrame: number;
    private readonly brushRadiusRange: [number, number];
    private readonly strokeLengthRange: [number, number];
    private readonly colorJitter: number;
    private readonly alphaRange: [number, number];
    private readonly onStatusChange?: (text: string) => void;

    private readonly referenceData: ImageData;

    private currentData: ImageData;
    private differenceMap: Float32Array;
    private totalDifference = 0;
    private nIteration = 0;

    private running = false;
    private frameHandle: number | null = null;

    private currentStroke: Stroke | null = null;
    private lastSuccessfulStroke: Stroke | null = null;
    private backgroundData: ImageData | null = null;
    private lastCost = 0;
    private optimizationSteps = 0;
    private readonly maxOptimizationSteps = 1_000;
    private readonly convergenceThresholdFactor = 30; // Cost change threshold per pixel of radius

    constructor(options: {
        ctx: CanvasRenderingContext2D;
        referenceBitmap: ImageBitmap;
        iterationsPerFrame?: number;
        brushRadiusRange?: [number, number];
        colorJitter?: number;
        alphaRange?: [number, number];
        strokeLengthRange?: [number, number];
        onStatusChange?: (text: string) => void;
    }) {
        this.ctx = options.ctx;
        this.onStatusChange = options.onStatusChange;

        this.iterationsPerFrame = options.iterationsPerFrame ?? 1;
        this.brushRadiusRange = options.brushRadiusRange ?? [1, 400];
        this.strokeLengthRange = options.strokeLengthRange ?? [2, 16];
        this.colorJitter = options.colorJitter ?? 9;
        this.alphaRange = options.alphaRange ?? [0.8, 1];

        this.width = options.referenceBitmap.width;
        this.height = options.referenceBitmap.height;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.save();
        this.ctx.fillStyle = "#ffffff";
        this.ctx.globalAlpha = 1;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();

        const referenceCanvas = document.createElement("canvas");
        referenceCanvas.width = this.width;
        referenceCanvas.height = this.height;
        const referenceCtx = referenceCanvas.getContext("2d");
        if (!referenceCtx) {
            throw new Error("Unable to create reference canvas context");
        }
        referenceCtx.drawImage(options.referenceBitmap, 0, 0, this.width, this.height);
        this.referenceData = referenceCtx.getImageData(0, 0, this.width, this.height);

        this.currentData = this.ctx.getImageData(0, 0, this.width, this.height);
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

        const target = this.pickTargetPixel();
        if (!target) return false;

        this.backgroundData = this.ctx.getImageData(0, 0, this.width, this.height);

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
                // Initialize stroke parameters
                const { r, g, b } = this.sampleReferenceColor(target.index);
                const color = this.randomizeColor(r, g, b);
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
        
        return true;
    }

    private optimizeStroke() {
        if (!this.currentStroke || !this.backgroundData) return;

        const learningRate = 0.00000005; // Tunable
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

        // If bbox is invalid, skip
        if (bbox.w <= 0 || bbox.h <= 0) return;

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
        const posLearningRate = learningRate * avgRadius / this.currentStroke.alpha;
        this.currentStroke.p0.x -= grads.p0x * posLearningRate;
        this.currentStroke.p0.y -= grads.p0y * posLearningRate;
        this.currentStroke.p1.x -= grads.p1x * posLearningRate;
        this.currentStroke.p1.y -= grads.p1y * posLearningRate;
        this.currentStroke.p2.x -= grads.p2x * posLearningRate;
        this.currentStroke.p2.y -= grads.p2y * posLearningRate;
        this.currentStroke.p0.radius -= grads.r0 * radiusLearningRate;
        this.currentStroke.p1.radius -= grads.r1 * radiusLearningRate;
        this.currentStroke.p2.radius -= grads.r2 * radiusLearningRate;
        
        this.currentStroke.color.r -= grads.r * colorLearningRate;
        this.currentStroke.color.g -= grads.g * colorLearningRate;
        this.currentStroke.color.b -= grads.b * colorLearningRate;
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
            `Cost: ${newGlobalCost.toFixed(0)} · Step: ${this.optimizationSteps}`
        );

        const convergenceThreshold = avgRadius * this.convergenceThresholdFactor;
        if (this.optimizationSteps >= this.maxOptimizationSteps || (Math.abs(costChange) < convergenceThreshold && this.optimizationSteps > 2)) {
            this.finalizeStroke();
        }
    }

    private finalizeStroke() {
        if (!this.currentStroke || !this.backgroundData) return;

        if (this.lastCost > this.totalDifference) {
            // The stroke made it worse, discard it
            this.ctx.putImageData(this.backgroundData, 0, 0);
            this.currentStroke = null;
            this.backgroundData = null;
            return;
        }
        
        this.drawStrokeToCanvas(this.currentStroke);
        
        // Store successful stroke for next iteration
        this.lastSuccessfulStroke = new Stroke(this.currentStroke);

        this.currentData = this.ctx.getImageData(0, 0, this.width, this.height);
        this.recomputeDifferenceMap();
        this.nIteration++;
        
        this.currentStroke = null;
        this.backgroundData = null;
    }

    private drawStrokeToCanvas(stroke: Stroke) {
        if (!this.backgroundData) return;
        
        this.ctx.putImageData(this.backgroundData, 0, 0);
        
        stroke.draw(this.ctx);
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

        const currentPatch = this.ctx.getImageData(bx, by, bw, bh);
        
        let cost = 0;
        const refData = this.referenceData.data;
        const curData = currentPatch.data;
        
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
        // Pick either start or end of the reference stroke
        const pickStart = Math.random() < 0.5;
        const basePoint = pickStart ? refStroke.p0 : refStroke.p2;
        
        const posJitter = 5;
        const radiusJitter = 2;
        const colorJitter = 10;
        const alphaJitter = 0.1;

        const startX = clamp(basePoint.x + randBetween(-posJitter, posJitter), 0, this.width);
        const startY = clamp(basePoint.y + randBetween(-posJitter, posJitter), 0, this.height);
        
        // Inherit radius with jitter
        const baseRadius = basePoint.radius;
        const newRadius = clamp(baseRadius + randBetween(-radiusJitter, radiusJitter), this.brushRadiusRange[0], this.brushRadiusRange[1]);

        // Generate other points based on angle and length
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

    private recomputeDifferenceMap() {
        this.totalDifference = computeDifferenceMap({
            reference: this.referenceData.data,
            current: this.currentData.data,
            out: this.differenceMap,
            distance: srgbCartesianSq,
        });
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

