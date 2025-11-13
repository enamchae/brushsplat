@vertex
fn brushVertex(
    @location(0) pos: vec4f,
) -> VertexOut {
    var out: VertexOut;

    out.posBuiltin = pos;

    return out;
}