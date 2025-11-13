@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn brushFragment(
    in: VertexOut,
) -> @location(0) vec4f {
    return vec4f(1, 1, 1, 1);
}