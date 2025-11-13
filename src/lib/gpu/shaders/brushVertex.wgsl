@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn brushVertex(
    @location(0) pos: vec2f,
    @builtin(vertex_index) vertexIndex: u32,
) -> VertexOut {
    var out: VertexOut;

    out.posBuiltin = vec4f(
        (pos.x / uniforms.resolution.x) * 2 - 1,
        -((pos.y / uniforms.resolution.y) * 2 - 1),
        0,
        1,
    );

    let u = f32(vertexIndex >> 1u) / f32(uniforms.curvePointCount - 1u);
    let v = f32(vertexIndex & 1u);
    
    out.uv = vec2f(u, v);

    return out;
}