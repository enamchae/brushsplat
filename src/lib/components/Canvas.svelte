<script lang="ts">
import brushSrc from "$lib/assets/brush.png";
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
});

const curvePoints = [
    {x: 60, y: 60, radius: 5},
    {x: 120, y: 500, radius: 10},
    {x: 500, y: 120, radius: 7},
];
</script>

<img
    src={brushSrc}
    alt="brushstroke"
/>

<canvas
    bind:this={canvas}
    width={800}
    height={800}
></canvas>