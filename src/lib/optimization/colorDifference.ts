export type DistanceRgb = (rDiff: number, gDiff: number, bDiff: number) => number;

export const srgbCartesian = (rDiff: number, gDiff: number, bDiff: number) => Math.hypot(rDiff, gDiff, bDiff);
export const srgbCartesianSq = (rDiff: number, gDiff: number, bDiff: number) => rDiff**2 + gDiff**2 + bDiff**2;

export const computeDifferenceMap = ({
    reference,
    current,
    out,
    distance,
}: {
    reference: ImageDataArray,
    current: ImageDataArray,
    out: Float32Array,
    distance: DistanceRgb,
}) => {
    let total = 0;

    for (let i = 0; i < out.length; i += 1) {
        const base = i * 4;
        const dr = reference[base] - current[base];
        const dg = reference[base + 1] - current[base + 1];
        const db = reference[base + 2] - current[base + 2];
        const diff = distance(dr, dg, db);
        out[i] = diff;
        total += diff;
    }

    return total;
};

export const computeCostOfPatch = ({
    reference,
    ctx,
    bbox,
    totalWidth,
    distance,
}: {
    reference: ImageDataArray,
    ctx: CanvasRenderingContext2D,
    bbox: { x: number, y: number, w: number, h: number },
    totalWidth: number,
    distance: DistanceRgb,
}) => {
    const bx = bbox.x;
    const by = bbox.y;
    const bw = bbox.w;
    const bh = bbox.h;

    const currentPatch = ctx.getImageData(bx, by, bw, bh);
    
    let cost = 0;
    const curData = currentPatch.data;
    
    for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
            const globalX = bx + x;
            const globalY = by + y;
            const globalIdx = (globalY * totalWidth + globalX) * 4;
            const localIdx = (y * bw + x) * 4;
            
            const dr = reference[globalIdx] - curData[localIdx];
            const dg = reference[globalIdx + 1] - curData[localIdx + 1];
            const db = reference[globalIdx + 2] - curData[localIdx + 2];
            
            cost += distance(dr, dg, db);
        }
    }

    return cost;
};


export enum ColorDifferenceMethod {
    RgbDistance,
    LightnessDistance,
    LightnessContrast,
}

export enum ColorPaletteMode {
    Any,
    Specified,
}

export const cheapLightness = (r: number, g: number, b: number) => {
    return 0.299 * r + 0.587 * g + 0.114 * b;
};