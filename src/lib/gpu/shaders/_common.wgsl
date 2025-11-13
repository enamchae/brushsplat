struct Uniforms {
    resolution: vec2f,
    curvePointCount: u32,
}

struct MeshLine {
    nPoints: u32,
    points: array<MeshLinePoint, 16>,
}

struct MeshLinePoint {
    col: vec3f,
    radius: f32,
    pos: vec2f,
}

struct VertexOut {
    @builtin(position) posBuiltin: vec4f,
    @location(0) pos: vec3f,
    @location(1) uv: vec2f,
}
