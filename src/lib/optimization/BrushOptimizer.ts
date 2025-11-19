type BrushOptimizerOptions = {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    referenceBitmap: ImageBitmap;
    iterationsPerFrame?: number;
    brushRadiusRange?: [number, number];
    colorJitter?: number;
    alphaRange?: [number, number];
    strokeLengthRange?: [number, number];
    onStatusChange?: (text: string) => void;
    onError?: (text: string) => void;
};

type StrokePoint = {
    x: number;
    y: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const randBetween = (min: number, max: number) => min + Math.random() * (max - min);

export class BrushOptimizer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly width: number;
    private readonly height: number;

    private readonly iterationsPerFrame: number;
    private readonly brushRadiusRange: [number, number];
    private readonly strokeLengthRange: [number, number];
    private readonly colorJitter: number;
    private readonly alphaRange: [number, number];
    private readonly onStatusChange?: (text: string) => void;
    private readonly onError?: (text: string) => void;

    private readonly referenceData: ImageData;

    private currentData: ImageData;
    private differenceMap: Float32Array;
    private totalDifference = 0;
    private iterationCount = 0;

    private running = false;
    private frameHandle: number | null = null;

    constructor(options: BrushOptimizerOptions) {
        this.canvas = options.canvas;
        this.ctx = options.ctx;
        this.onStatusChange = options.onStatusChange;
        this.onError = options.onError;

        this.iterationsPerFrame = options.iterationsPerFrame ?? 1;
        this.brushRadiusRange = options.brushRadiusRange ?? [6, 28];
        this.strokeLengthRange = options.strokeLengthRange ?? [16, 84];
        this.colorJitter = options.colorJitter ?? 18;
        this.alphaRange = options.alphaRange ?? [0.08, 0.35];

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

        for (let i = 0; i < this.iterationsPerFrame; i += 1) {
            const shouldContinue = this.performIteration();
            if (!shouldContinue) {
                this.stop();
                this.onStatusChange?.("Optimization complete");
                return;
            }
        }

        this.frameHandle = requestAnimationFrame(this.loop);
    };

    private performIteration(): boolean {
        if (this.totalDifference <= 1e-3) {
            return false;
        }

        const target = this.pickTargetPixel();
        if (!target) {
            return false;
        }

        this.applyStroke(target.index, target.x, target.y);
        this.refreshCanvasSnapshot();
        this.recomputeDifferenceMap();
        this.iterationCount += 1;
        this.onStatusChange?.(
            `Δrgb avg: ${(this.totalDifference / this.differenceMap.length).toFixed(2)} · strokes: ${this.iterationCount}`,
        );

        return true;
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

    private applyStroke(pixelIndex: number, x: number, y: number) {
        const { r, g, b } = this.sampleReferenceColor(pixelIndex);
        const color = this.randomizeColor(r, g, b);

        const radius = randBetween(this.brushRadiusRange[0], this.brushRadiusRange[1]);
        const length = randBetween(this.strokeLengthRange[0], this.strokeLengthRange[1]);
        const points = this.buildStrokePoints({ x, y }, radius, length);
        const [p0, p1, p2] = points;

        this.ctx.save();
        this.ctx.globalAlpha = randBetween(this.alphaRange[0], this.alphaRange[1]);
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        this.ctx.lineWidth = radius;
        this.ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        this.ctx.beginPath();
        this.ctx.moveTo(p0.x, p0.y);
        this.ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
        this.ctx.stroke();
        this.ctx.restore();
    }

    private buildStrokePoints(origin: StrokePoint, radius: number, length: number): [StrokePoint, StrokePoint, StrokePoint] {
        const angle = Math.random() * Math.PI * 2;
        const jitter = radius * 0.75;

        const p0 = origin;
        const p1 = {
            x: clamp(
                origin.x + Math.cos(angle) * (length * 0.5) + randBetween(-jitter, jitter),
                0,
                this.width,
            ),
            y: clamp(
                origin.y + Math.sin(angle) * (length * 0.5) + randBetween(-jitter, jitter),
                0,
                this.height,
            ),
        };
        const p2 = {
            x: clamp(origin.x + Math.cos(angle) * length + randBetween(-jitter, jitter), 0, this.width),
            y: clamp(origin.y + Math.sin(angle) * length + randBetween(-jitter, jitter), 0, this.height),
        };

        return [p0, p1, p2];
    }

    private refreshCanvasSnapshot() {
        try {
            this.currentData = this.ctx.getImageData(0, 0, this.width, this.height);
        } catch (err) {
            this.onError?.("Failed to read canvas pixels");
            throw err;
        }
    }

    private recomputeDifferenceMap() {
        const reference = this.referenceData.data;
        const current = this.currentData.data;
        let total = 0;

        for (let i = 0; i < this.differenceMap.length; i += 1) {
            const base = i * 4;
            const dr = reference[base] - current[base];
            const dg = reference[base + 1] - current[base + 1];
            const db = reference[base + 2] - current[base + 2];
            const diff = Math.sqrt(dr * dr + dg * dg + db * db);
            this.differenceMap[i] = diff;
            total += diff;
        }

        this.totalDifference = total;
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

