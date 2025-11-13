import { GpuUniformsBufferManager } from "./buffers/GpuUniformsBufferManager";
import { GpuMeshLineRenderPipelineManager } from "./pipelines/GpuMeshLineRenderPipelineManager";

export class GpuBrushRunner {
    private readonly device: GPUDevice;
    private readonly context: GPUCanvasContext;

    readonly uniformsManager: GpuUniformsBufferManager;

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
        const uniformsManager = new GpuUniformsBufferManager({ device });
        uniformsManager.writeResolution(800, 800);
        

        this.device = device;
        this.context = context;

        this.meshLineRenderPipelineManager = new GpuMeshLineRenderPipelineManager({device, format, uniformsManager});
        this.uniformsManager = uniformsManager;
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