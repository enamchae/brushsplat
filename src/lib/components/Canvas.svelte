<script lang="ts">
import { BrushOptimizer } from "$lib/optimization/BrushOptimizer";
import { ColorPaletteMode, ColorDifferenceMethod } from "$lib/optimization/colorDifference";
import { onDestroy, onMount, untrack } from "svelte";

let {
    onStatusChange,
    onErr,
    referenceBitmap,
    colorPaletteMode,
    colorDifferenceMethod,
    colorPalette,
    reset = $bindable(),
    optimizer = $bindable(),
}: {
    onStatusChange: (text: string) => void;
    onErr: (text: string) => void;
    referenceBitmap: ImageBitmap | null;
    colorPaletteMode: ColorPaletteMode;
    colorDifferenceMethod: ColorDifferenceMethod;
    colorPalette: string[];
    reset?: (() => void) | null,
    optimizer?: BrushOptimizer | null,
} = $props();

const DEFAULT_CANVAS_SIZE = 600;

let canvas: HTMLCanvasElement;
let context: CanvasRenderingContext2D | null = null;

let width = $state(DEFAULT_CANVAS_SIZE);
let height = $state(DEFAULT_CANVAS_SIZE);

const stopOptimizer = () => {
    if (!optimizer) return;
    optimizer.destroy();
    optimizer = null;
};

reset = () => {
    if (!context) return;
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
};

onMount(() => {
    context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
        onErr("can't get 2d context");
        return;
    }
    reset?.();
});

onDestroy(() => {
    stopOptimizer();
});

$effect(() => {
    if (!canvas || !context) return;

    if (!referenceBitmap) {
        untrack(stopOptimizer);
        width = DEFAULT_CANVAS_SIZE;
        height = DEFAULT_CANVAS_SIZE;
        canvas.width = DEFAULT_CANVAS_SIZE;
        canvas.height = DEFAULT_CANVAS_SIZE;
        reset?.();
        onStatusChange("waiting for reference image");
        return;
    }

    const nextWidth = referenceBitmap.width;
    const nextHeight = referenceBitmap.height;

    width = nextWidth;
    height = nextHeight;
    canvas.width = nextWidth;
    canvas.height = nextHeight;

    reset?.();

    untrack(stopOptimizer);
    optimizer = new BrushOptimizer({
        ctx: context,
        referenceBitmap,
        onStatusChange,
        onErr,
        iterationsPerFrame: 8,
        colorJitter: 10,
        colorPaletteMode,
        colorDifferenceMethod,
        colorPalette,
    });
    untrack(() => optimizer!).start();
});

$effect(() => {
    if (optimizer) {
        optimizer.setColorMode(colorPaletteMode, colorPalette);
        optimizer.setColorDifferenceMethod(colorDifferenceMethod);
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
