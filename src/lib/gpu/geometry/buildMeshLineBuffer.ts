import { vec2, type Vec2 } from "wgpu-matrix";

export type CurvePoint = {
    x: number;
    y: number;
    radius: number;
}

export const buildMeshLineBuffer = (curvePoints: CurvePoint[]) => {
    if (curvePoints.length === 0) {
        return new Float32Array(0);
    }

    if (curvePoints.length === 1) {
        // just assume the normal is ±x
        const p = curvePoints[0];
        return new Float32Array([
            p.x - p.radius, p.y,
            p.x + p.radius, p.y,
        ]);
    }

    const coords = new Float32Array(curvePoints.length * 4); // 2 triangles per point
    
    let coordOffset = 0;
    for (let i = 0; i < curvePoints.length; i++) {
        const lastPoint = i === 0
            ? curvePoints[i]
            : curvePoints[i - 1];
        const nextPoint = i === curvePoints.length - 1
            ? curvePoints[i]
            : curvePoints[i + 1];
        
        const tangent = vec2.normalize(vec2.fromValues(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y));
        const normal = vec2.fromValues(-tangent[1], tangent[0]);
        
        const curPoint = curvePoints[i];
        const curVec = vec2.fromValues(curPoint.x, curPoint.y);

        coords.set(vec2.add(curVec, vec2.mulScalar(normal, -curPoint.radius)), coordOffset);
        coords.set(vec2.add(curVec, vec2.mulScalar(normal, curPoint.radius)), coordOffset + 2);

        coordOffset += 4;
    }
    
    return coords;
}
