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
</script>

<img
    src={brushSrc}
    alt="brushstroke"
/>

<canvas bind:this={canvas}></canvas>