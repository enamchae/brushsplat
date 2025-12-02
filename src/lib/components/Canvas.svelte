<script lang="ts">
    import { BrushOptimizer } from "$lib/optimization/BrushOptimizer";
    import { ColorPaletteMode } from "$lib/optimization/colorDifference";
    import { onDestroy, onMount } from "svelte";

    const {
        onStatusChange,
        onErr,
        referenceBitmap,
        colorPaletteMode,
        colorPalette,
    }: {
        onStatusChange: (text: string) => void;
        onErr: (text: string) => void;
        referenceBitmap: ImageBitmap | null;
        colorPaletteMode: ColorPaletteMode;
        colorPalette: string[];
    } = $props();

    const DEFAULT_CANVAS_SIZE = 800;

    let canvas: HTMLCanvasElement;
    let context: CanvasRenderingContext2D | null = null;
    let optimizer: BrushOptimizer | null = null;

    let width = $state(DEFAULT_CANVAS_SIZE);
    let height = $state(DEFAULT_CANVAS_SIZE);

    const stopOptimizer = () => {
        if (!optimizer) return;
        optimizer.destroy();
        optimizer = null;
    };

    const resetCanvas = (targetWidth: number, targetHeight: number) => {
        if (!context) return;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.clearRect(0, 0, targetWidth, targetHeight);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, targetWidth, targetHeight);
        context.restore();
    };

    onMount(() => {
        context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
            onErr("can't get 2d context");
            return;
        }
        resetCanvas(width, height);
    });

    onDestroy(() => {
        stopOptimizer();
    });

    $effect(() => {
        if (!canvas || !context) return;

        if (!referenceBitmap) {
            stopOptimizer();
            width = DEFAULT_CANVAS_SIZE;
            height = DEFAULT_CANVAS_SIZE;
            canvas.width = DEFAULT_CANVAS_SIZE;
            canvas.height = DEFAULT_CANVAS_SIZE;
            resetCanvas(DEFAULT_CANVAS_SIZE, DEFAULT_CANVAS_SIZE);
            onStatusChange("waiting for reference image");
            return;
        }

        const nextWidth = referenceBitmap.width;
        const nextHeight = referenceBitmap.height;

        width = nextWidth;
        height = nextHeight;
        canvas.width = nextWidth;
        canvas.height = nextHeight;

        resetCanvas(nextWidth, nextHeight);

        stopOptimizer();
        optimizer = new BrushOptimizer({
            ctx: context,
            referenceBitmap,
            onStatusChange,
            onErr,
            iterationsPerFrame: 3,
            colorJitter: 20,
            colorPaletteMode,
            colorPalette,
        });
        optimizer.start();
    });

    $effect(() => {
        if (optimizer) {
            optimizer.setColorMode(colorPaletteMode, colorPalette);
        }
    });

    /*
import brushSrc from "$lib/assets/brush.png";
import { sampleCatmullRom } from "$lib/gpu/geometry/sampleCatmullRom";
import { GpuBrushRunner } from "$lib/gpu/GpuBrushRunner";
import { requestGpuDeviceAndContext } from "$lib/gpu/requestGpuDeviceAndContext";

const curvePoints = [
    {x: 50, y: 30, radius: 0},
    {x: 120, y: 600, radius: 70},
    {x: 600, y: 320, radius: 40},
    {x: 150, y: 20, radius: 0},
];

const loadBrushTexture = async () => {
    const response = await fetch(brushSrc);
    const blob = await response.blob();
    return await createImageBitmap(blob);
};

onMount(async () => {
    const response = await requestGpuDeviceAndContext({onStatusChange, onErr, canvas});
    if (response === null) return;
    const {device, context, format} = response;

    const brushBitmap = await loadBrushTexture();

    const runner = new GpuBrushRunner({device, format, context, curvePoints, width, height, brushBitmap});
    await runner.render();
});
*/
</script>

<canvas bind:this={canvas} {width} {height}></canvas>
