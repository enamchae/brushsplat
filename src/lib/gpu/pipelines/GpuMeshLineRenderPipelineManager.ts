import commonModuleSrc from "$lib/gpu/shaders/_common.wgsl?raw";
import brushVertexModuleSrc from "$lib/gpu/shaders/brushVertex.wgsl?raw";
import brushFragmentModuleSrc from "$lib/gpu/shaders/brushFragment.wgsl?raw";

export class GpuMeshLineRenderPipelineManager {
    readonly renderPipeline: GPURenderPipeline;

    constructor({
        device,
        format,
    }: {
        device: GPUDevice,
        format: GPUTextureFormat,
    }) {
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
            // bindGroupLayouts: [uniformsManager.bindGroupLayout],
            bindGroupLayouts: [],
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
                topology: "triangle-list",
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
        renderPassEncoder.end();
    }
}