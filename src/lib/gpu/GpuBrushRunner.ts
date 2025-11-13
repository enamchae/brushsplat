import { GpuUniformsBufferManager } from "./buffers/GpuUniformsBufferManager";
import { GpuMeshLineRenderPipelineManager } from "./pipelines/GpuMeshLineRenderPipelineManager";
import { GpuMeshLineCoordsBufferManager } from "./buffers/GpuMeshLineCoordsBufferManager";
import { GpuBrushTextureManager } from "./buffers/GpuBrushTextureManager";
import type { CurvePoint } from "./geometry/buildMeshLineBuffer";
import { sampleCatmullRom } from "./geometry/sampleCatmullRom";


export class GpuBrushRunner {
    private readonly device: GPUDevice;
    private readonly context: GPUCanvasContext;

    readonly uniformsManager: GpuUniformsBufferManager;
    readonly brushTextureManager: GpuBrushTextureManager;

    private readonly meshLineRenderPipelineManager: GpuMeshLineRenderPipelineManager;

    constructor({
        device,
        format,
        context,
        curvePoints,
        width,
        height,
        brushBitmap,
    }: {
        device: GPUDevice,
        format: GPUTextureFormat,
        context: GPUCanvasContext,
        curvePoints: CurvePoint[],
        width: number,
        height: number,
        brushBitmap: ImageBitmap,
    }) {
        const uniformsManager = new GpuUniformsBufferManager({ device });
        uniformsManager.writeResolution(width, height);

        const sampledPoints = sampleCatmullRom({curvePoints, nDivisions: 8});
        uniformsManager.writeCurvePointCount(sampledPoints.length);

        const brushTextureManager = new GpuBrushTextureManager({
            device,
            textureData: brushBitmap,
        });

        const meshLineCoordsManager = new GpuMeshLineCoordsBufferManager({device, curvePoints: sampledPoints});
        const meshLineRenderPipelineManager = new GpuMeshLineRenderPipelineManager({
            device,
            format,
            uniformsManager,
            meshLineCoordsManager,
            brushTextureManager,
        });
        

        this.device = device;
        this.context = context;

        this.uniformsManager = uniformsManager;
        this.brushTextureManager = brushTextureManager;
        this.meshLineRenderPipelineManager = meshLineRenderPipelineManager;
    }


    writeCanvasDims(width: number, height: number) {
        this.uniformsManager.writeResolution(width, height);
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