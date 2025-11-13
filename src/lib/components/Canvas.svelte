<script lang="ts">
import brushSrc from "$lib/assets/brush.png";
    import { sampleCatmullRom } from "$lib/gpu/geometry/sampleCatmullRom";
    import { GpuBrushRunner } from "$lib/gpu/GpuBrushRunner";
import { requestGpuDeviceAndContext } from "$lib/gpu/requestGpuDeviceAndContext";
import { onMount } from "svelte";

const {
    onStatusChange,
    onErr,
}: {
    onStatusChange: (text: string) => void,
    onErr: (text: string) => void,
} = $props();

let canvas: HTMLCanvasElement;

onMount(async () => {
    const response = await requestGpuDeviceAndContext({onStatusChange, onErr, canvas});
    if (response === null) return;
    const {device, context, format} = response;

    const brushBitmap = await loadBrushTexture();

    const runner = new GpuBrushRunner({device, format, context, curvePoints, width, height, brushBitmap});
    await runner.render();
});

const loadBrushTexture = async () => {
    const response = await fetch(brushSrc);
    const blob = await response.blob();
    return await createImageBitmap(blob);
};

const curvePoints = [
    {x: 50, y: 30, radius: 0},
    {x: 120, y: 600, radius: 70},
    {x: 600, y: 320, radius: 40},
    {x: 150, y: 20, radius: 0},
];

let width = $state(800);
let height = $state(800);
</script>

<canvas
    bind:this={canvas}
    {width}
    {height}
></canvas>