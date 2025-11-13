@vertex
fn brushVertex(
    @location(0) pos: vec2f,
) -> VertexOut {
    var out: VertexOut;

    out.posBuiltin = vec4f(
        (pos.x / uniforms.resolution.x) * 2 - 1,
        -((pos.y / uniforms.resolution.y) * 2 - 1),
        0,
        1,
    );

    return out;
}