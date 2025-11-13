import { GpuMeshLineRenderPipelineManager } from "./meshline/GpuMeshLineRenderPipelineManager";

export class GpuBrushRunner {
    private readonly device: GPUDevice;
    private readonly context: GPUCanvasContext;

    private readonly meshLineRenderPipelineManager: GpuMeshLineRenderPipelineManager;

    constructor({
        device,
        format,
        context,
    }: {
        device: GPUDevice,
        format: GPUTextureFormat,
        context: GPUCanvasContext,
    }) {
        this.device = device;
        this.context = context;

        this.meshLineRenderPipelineManager = new GpuMeshLineRenderPipelineManager({device, format});
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