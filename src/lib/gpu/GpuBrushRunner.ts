import { GpuUniformsBufferManager } from "./buffers/GpuUniformsBufferManager";
import { GpuMeshLineRenderPipelineManager } from "./pipelines/GpuMeshLineRenderPipelineManager";
import { GpuMeshLineCoordsBufferManager } from "./buffers/GpuMeshLineCoordsBufferManager";
import type { CurvePoint } from "./geometry/buildMeshLineBuffer";
import { sampleCatmullRom } from "./geometry/sampleCatmullRom";

export class GpuBrushRunner {
    private readonly device: GPUDevice;
    private readonly context: GPUCanvasContext;

    readonly uniformsManager: GpuUniformsBufferManager;

    private readonly meshLineRenderPipelineManager: GpuMeshLineRenderPipelineManager;
    private meshLineBufferManager: GpuMeshLineCoordsBufferManager | null = null;

    constructor({
        device,
        format,
        context,
        curvePoints,
    }: {
        device: GPUDevice,
        format: GPUTextureFormat,
        context: GPUCanvasContext,
        curvePoints: CurvePoint[],
    }) {
        const uniformsManager = new GpuUniformsBufferManager({ device });
        uniformsManager.writeResolution(800, 800);

        const sampledPoints = sampleCatmullRom({curvePoints, nDivisions: 8});

        const meshLineCoordsManager = new GpuMeshLineCoordsBufferManager({device, curvePoints: sampledPoints});
        const meshLineRenderPipelineManager = new GpuMeshLineRenderPipelineManager({device, format, uniformsManager, meshLineCoordsManager});
        

        this.device = device;
        this.context = context;

        this.uniformsManager = uniformsManager;
        this.meshLineBufferManager = meshLineCoordsManager;
        this.meshLineRenderPipelineManager = meshLineRenderPipelineManager;
    }
    

    async render() {
        const commandEncoder = this.device.createCommandEncoder({
            label: "render command encoder",
        });
        this.meshLineRenderPipelineManager.addRenderPass({
            commandEncoder,
            context: this.context,
        });
        this.device.queue.submit([commandEncoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
    }
}