import commonModuleSrc from "$lib/gpu/shaders/_common.wgsl?raw";
import brushVertexModuleSrc from "$lib/gpu/shaders/brushVertex.wgsl?raw";
import brushFragmentModuleSrc from "$lib/gpu/shaders/brushFragment.wgsl?raw";
import { GpuUniformsBufferManager } from "$lib/gpu/buffers/GpuUniformsBufferManager";
import type { GpuMeshLineCoordsBufferManager } from "$lib/gpu/buffers/GpuMeshLineCoordsBufferManager";
import type { GpuBrushTextureManager } from "$lib/gpu/buffers/GpuBrushTextureManager";

export class GpuMeshLineRenderPipelineManager {
    readonly renderPipeline: GPURenderPipeline;
    private readonly uniformsManager: GpuUniformsBufferManager;
    private readonly meshLineCoordsManager: GpuMeshLineCoordsBufferManager;
    private readonly brushTextureManager: GpuBrushTextureManager;

    constructor({
        device,
        format,
        uniformsManager,
        meshLineCoordsManager,
        brushTextureManager,
    }: {
        device: GPUDevice,
        format: GPUTextureFormat,
        uniformsManager: GpuUniformsBufferManager,
        meshLineCoordsManager: GpuMeshLineCoordsBufferManager,
        brushTextureManager: GpuBrushTextureManager,
    }) {
        this.uniformsManager = uniformsManager;
        this.meshLineCoordsManager = meshLineCoordsManager;
        this.brushTextureManager = brushTextureManager;
        const vertexModule = device.createShaderModule({
            label: "mesh line vertex module",
            code: commonModuleSrc + brushVertexModuleSrc,
        });
        const fragmentModule = device.createShaderModule({
            label: "mesh line fragment module",
            code: commonModuleSrc + brushFragmentModuleSrc,
        });
        
        const renderPipelineLayout = device.createPipelineLayout({
            label: "mesh line render pipeline",
            bindGroupLayouts: [
                uniformsManager.bindGroupLayout,
                brushTextureManager.bindGroupLayout,
            ],
        });
        this.renderPipeline = device.createRenderPipeline({
            label: "mesh line render pipeline",

            layout: renderPipelineLayout,

            vertex: {
                module: vertexModule,
                entryPoint: "brushVertex",
                buffers: [
                    {
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x2",
                            },
                        ],
                        arrayStride: 8,
                        stepMode: "vertex",
                    },
                ],
            },

            fragment: {
                module: fragmentModule,
                entryPoint: "brushFragment",
                targets: [
                    {
                        format,
                    },
                ],
            },

            primitive: {
                topology: "triangle-strip",
            },
        });
    }

    addRenderPass({
        commandEncoder,
        context,
    }: {
        commandEncoder: GPUCommandEncoder,
        context: GPUCanvasContext,
    }) {
        const renderPassEncoder = commandEncoder.beginRenderPass({
            label: "points render pass",
            colorAttachments: [
                {
                    clearValue: {
                        r: 0,
                        g: 0,
                        b: 0,
                        a: 1,
                    },

                    loadOp: "clear",
                    storeOp: "store",
                    view: context.getCurrentTexture().createView(),
                },
            ],
        });
        renderPassEncoder.setPipeline(this.renderPipeline);
        renderPassEncoder.setBindGroup(0, this.uniformsManager.bindGroup);
        renderPassEncoder.setBindGroup(1, this.brushTextureManager.bindGroup);
        renderPassEncoder.setVertexBuffer(0, this.meshLineCoordsManager.buffer);
        renderPassEncoder.draw(this.meshLineCoordsManager.vertexCount);
        renderPassEncoder.end();
    }
}