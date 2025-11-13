export class GpuBrushTextureManager {
	private readonly device: GPUDevice;

	readonly texture: GPUTexture;
	readonly sampler: GPUSampler;
	readonly bindGroupLayout: GPUBindGroupLayout;
	readonly bindGroup: GPUBindGroup;

	constructor({
		device,
		textureData,
	}: {
		device: GPUDevice,
		textureData: ImageBitmap,
	}) {
		this.device = device;

		const width = textureData.width;
		const height = textureData.height;

		const texture = device.createTexture({
			label: "brush texture",
			size: { width, height },
			format: "rgba8unorm",
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
		});

		device.queue.copyExternalImageToTexture(
			{ source: textureData, flipY: false },
			{ texture },
			{ width, height },
		);

		const sampler = device.createSampler({
			label: "brush texture sampler",
			magFilter: "linear",
			minFilter: "linear",
			mipmapFilter: "linear",
			addressModeU: "clamp-to-edge",
			addressModeV: "clamp-to-edge",
		});

		const bindGroupLayout = device.createBindGroupLayout({
			label: "brush texture bind group layout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					texture: {
						sampleType: "float",
						viewDimension: "2d",
					},
				},
				{
					binding: 1,
					visibility: GPUShaderStage.FRAGMENT,
					sampler: {
						type: "filtering",
					},
				},
			],
		});

		const bindGroup = device.createBindGroup({
			label: "brush texture bind group",
			layout: bindGroupLayout,
			entries: [
				{
					binding: 0,
					resource: texture.createView(),
				},
				{
					binding: 1,
					resource: sampler,
				},
			],
		});

		this.texture = texture;
		this.sampler = sampler;
		this.bindGroupLayout = bindGroupLayout;
		this.bindGroup = bindGroup;
	}
}
