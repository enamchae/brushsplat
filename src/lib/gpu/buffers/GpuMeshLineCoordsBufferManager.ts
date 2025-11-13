import { buildMeshLineBuffer, type CurvePoint } from "../geometry/buildMeshLineBuffer";

export class GpuMeshLineCoordsBufferManager {
	private readonly device: GPUDevice;

	readonly buffer: GPUBuffer;
	readonly bindGroupLayout: GPUBindGroupLayout;
	readonly bindGroup: GPUBindGroup;
	readonly vertexCount: number;

	constructor({
		device,
		curvePoints,
	}: {
		device: GPUDevice;
		curvePoints: CurvePoint[];
	}) {
		const coords = buildMeshLineBuffer(curvePoints);
		this.vertexCount = coords.length / 2; // 2 floats per vertex (x, y)

		const coordsBuffer = device.createBuffer({
			label: "mesh line coords buffer",
			size: coords.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
		});
		device.queue.writeBuffer(coordsBuffer, 0, coords);

        const coordsBindGroupLayout = device.createBindGroupLayout({
            label: "uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "uniform",
                    },
                },
            ],
        });
        const coordsBindGroup = device.createBindGroup({
            label: "mesh line coords bind group",
            layout: coordsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: coordsBuffer,
                    },
                },
            ],
        });

		this.device = device;
        this.buffer = coordsBuffer;
		this.bindGroupLayout = coordsBindGroupLayout;
		this.bindGroup = coordsBindGroup;
	}
}
