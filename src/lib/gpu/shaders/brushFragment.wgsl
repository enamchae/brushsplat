@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(0) var brushTexture: texture_2d<f32>;
@group(1) @binding(1) var brushSampler: sampler;

@fragment
fn brushFragment(
    in: VertexOut,
) -> @location(0) vec4f {
    return textureSample(brushTexture, brushSampler, in.uv);
}