import type { CurvePoint } from "./buildMeshLineBuffer";

const catmullRomBasis = (tSegment: number, x0: number, x1: number, x2: number, x3: number) => {
    return 0.5 * (
        (2 * x1)
        + tSegment * (
            (-x0 + x2)
            + tSegment * (
                (2 * x0 - 5 * x1 + 4 * x2 - x3)
                + tSegment * (-x0 + 3 * x1 - 3 * x2 + x3)
            )
        )
    );
};

export const sampleCatmullRom = ({
    curvePoints,
    nDivisons,
}: {
    curvePoints: CurvePoint[],
    nDivisons: number,
}): CurvePoint[] => {
    if (curvePoints.length < 2) {
        return curvePoints;
    }

    const sampledPoints: CurvePoint[] = [];

    for (let i = 0; i < curvePoints.length - 1; i++) {
        const p0 = i === 0
            ? curvePoints[i]
            : curvePoints[i - 1];
        const p1 = curvePoints[i];
        const p2 = curvePoints[i + 1];
        const p3 = i === curvePoints.length - 2
            ? curvePoints[i + 1]
            : curvePoints[i + 2];

        for (let nDivision = 0; nDivision < nDivisons; nDivision++) {
            const tSegment = nDivision / nDivisons;
            const x = catmullRomBasis(tSegment, p0.x, p1.x, p2.x, p3.x);
            const y = catmullRomBasis(tSegment, p0.y, p1.y, p2.y, p3.y);
            const radius = catmullRomBasis(tSegment, p0.radius, p1.radius, p2.radius, p3.radius);

            sampledPoints.push({ x, y, radius });
        }
    }

    const lastPoint = curvePoints.at(-1)!;
    sampledPoints.push({
        x: lastPoint.x,
        y: lastPoint.y,
        radius: lastPoint.radius,
    });

    return sampledPoints;
};
