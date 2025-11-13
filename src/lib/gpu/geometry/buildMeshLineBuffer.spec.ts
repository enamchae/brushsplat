import { describe, it, expect } from "vitest";
import { buildMeshLineBuffer, type CurvePoint } from "./buildMeshLineBuffer";

describe(buildMeshLineBuffer.name, () => {
    it("produces the correct buffer length based on the number of given points", () => {
        const curvePoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.25 },
            { x: 1, y: 0, radius: 0.25 },
            { x: 1, y: 1, radius: 0.25 },
        ];
        
        const array = buildMeshLineBuffer(curvePoints);
        
        expect(array.length).toBe(curvePoints.length * 4);
    });

    it("generates endpoint vertices with the correct perpendicular offsets", () => {
        const curvePoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.1 },
            { x: 1, y: 0, radius: 0.1 },
        ];
        
        const array = buildMeshLineBuffer(curvePoints);

        const expected = new Float32Array([
            0, -0.1,
            0, 0.1,

            1, -0.1,
            1, 0.1,
        ]);

        expect(array.length).toBe(expected.length);
        for (let i = 0; i < array.length; i++) {
            expect(array[i]).toBeCloseTo(expected[i]);
        }
    });

    it("generates middle vertices with the average-direction perpendicular offsets", () => {
        const curvePoints: CurvePoint[] = [
            { x: 0, y: 0, radius: 0.1 },
            { x: 0, y: 1, radius: 0.1 },
            { x: 1, y: 1, radius: 0.1 },
        ];
        
        const array = buildMeshLineBuffer(curvePoints);

        const expected = new Float32Array([
            0.1, 0,
            -0.1, 0,

            0.1 * Math.SQRT1_2, 1 - 0.1 * Math.SQRT1_2,
            -0.1 * Math.SQRT1_2, 1 + 0.1 * Math.SQRT1_2,

            1, 0.9,
            1, 1.1,
        ]);

        expect(array.length).toBe(expected.length);
        for (let i = 0; i < array.length; i++) {
            expect(array[i]).toBeCloseTo(expected[i]);
        }
    });
});
