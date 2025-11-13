import { describe, it, expect } from "vitest";
import { sampleCatmullRom } from "./sampleCatmullRom";
import type { CurvePoint } from "./buildMeshLineBuffer";

describe(sampleCatmullRom.name, () => {
    it("returns the same points when given less than 2 control points", () => {
        const curvePoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.1 },
        ];
        
        const result = sampleCatmullRom({curvePoints, nDivisions: 8});
        
        expect(result).toEqual(curvePoints);
    });

    it("generates the correct number of points", () => {
        const curvePoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.1 },
            { x: 1, y: 1, radius: 0.1 },
            { x: 2, y: 0, radius: 0.1 },
        ];
        
        const nDivisions = 8;
        const result = sampleCatmullRom({curvePoints, nDivisions});
        
        const nExpectedPoints = (curvePoints.length - 1) * nDivisions + 1;
        expect(result.length).toBe(nExpectedPoints);
    });

    it("passes through the control points", () => {
        const curvePoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.1 },
            { x: 1, y: 1, radius: 0.15 },
            { x: 2, y: 0, radius: 0.2 }
        ];
        
        const nDivisions = 8;
        const result = sampleCatmullRom({curvePoints, nDivisions});
        
        expect(result[0].x).toBeCloseTo(curvePoints[0].x);
        expect(result[0].y).toBeCloseTo(curvePoints[0].y);
        
        expect(result[8].x).toBeCloseTo(curvePoints[1].x);
        expect(result[8].y).toBeCloseTo(curvePoints[1].y);
        
        expect(result[16].x).toBeCloseTo(curvePoints[2].x);
        expect(result[16].y).toBeCloseTo(curvePoints[2].y);
    });
});
