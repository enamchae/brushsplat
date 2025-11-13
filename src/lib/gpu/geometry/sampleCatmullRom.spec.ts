import { describe, it, expect } from "vitest";
import { sampleCatmullRom } from "./sampleCatmullRom";
import type { CurvePoint } from "./buildMeshLineBuffer";

describe(sampleCatmullRom.name, () => {
    it("returns the same points when given less than 2 control points", () => {
        const controlPoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.1 }
        ];
        
        const result = sampleCatmullRom(controlPoints, 8);
        
        expect(result).toEqual(controlPoints);
    });

    it("generates the correct number of sampled points", () => {
        const controlPoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.1 },
            { x: 1, y: 1, radius: 0.1 },
            { x: 2, y: 0, radius: 0.1 }
        ];
        
        const divisions = 8;
        const result = sampleCatmullRom(controlPoints, divisions);
        
        // For n control points, we have (n-1) segments
        // Each segment generates (divisions + 1) points, but we skip duplicates at boundaries
        // So total = (n-1) * divisions + 1
        const expectedCount = (controlPoints.length - 1) * divisions + 1;
        expect(result.length).toBe(expectedCount);
    });

    it("passes through the control points at segment boundaries", () => {
        const controlPoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.1 },
            { x: 1, y: 1, radius: 0.15 },
            { x: 2, y: 0, radius: 0.2 }
        ];
        
        const divisions = 8;
        const result = sampleCatmullRom(controlPoints, divisions);
        
        // First point should match first control point
        expect(result[0].x).toBeCloseTo(controlPoints[0].x, 5);
        expect(result[0].y).toBeCloseTo(controlPoints[0].y, 5);
        
        // Last point should match last control point
        const lastIdx = result.length - 1;
        expect(result[lastIdx].x).toBeCloseTo(controlPoints[controlPoints.length - 1].x, 5);
        expect(result[lastIdx].y).toBeCloseTo(controlPoints[controlPoints.length - 1].y, 5);
    });
});
