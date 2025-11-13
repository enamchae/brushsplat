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

    const runner = new GpuBrushRunner({device, format, context, curvePoints, width, height});
    await runner.render();
});

const curvePoints = [
    {x: 30, y: 30, radius: 0},
    {x: 120, y: 300, radius: 20},
    {x: 300, y: 120, radius: 10},
    {x: 150, y: 20, radius: 0},
];

let width = $state(400);
let height = $state(400);
</script>

<img
    src={brushSrc}
    alt="brushstroke"
/>

<canvas
    bind:this={canvas}
    {width}
    {height}
></canvas>