<script lang="ts">
import Canvas from "$lib/components/Canvas.svelte";
import ImageUpload from "$lib/components/ImageUpload.svelte";
import type { BrushOptimizer } from "$lib/optimization/BrushOptimizer";
import { ColorDifferenceMethod, ColorPaletteMode } from "$lib/optimization/colorDifference";

let status = $state("loading javascript");
let err = $state<string | null>(null);

const randomHex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
const randomColor = () => `#${randomHex()}${randomHex()}${randomHex()}`;

let colorDifferenceMethod = $state(ColorDifferenceMethod.RgbDistance);
let colorPaletteMode = $state(ColorPaletteMode.Any);
let colorPalette = $state<string[]>(new Array(3).fill(0).map(() => randomColor()));

// $effect(() => {
//     untrack(() => optimizer)?.setColorMode(colorPaletteMode, colorPalette);
// });

let optimizer = $state<BrushOptimizer | null>(null);
let reset = $state<(() => void) | null>(null);

let image: {
    src: string;
    bitmap: ImageBitmap;
} | null = $state(null);
</script>

<main>
    <control-panel>
        <status-panel>
            <h3>Status</h3>
            <status-text>{status}</status-text>
        </status-panel>

        <image-upload>
            <h3>Image upload</h3>

            <ImageUpload
                onImageChange={async (file) => {
                    if (image !== null) {
                        URL.revokeObjectURL(image.src);
                    }

                    image = {
                        src: URL.createObjectURL(file),
                        bitmap: await createImageBitmap(file),
                    };
                }}
            />

            <image-preview>
                {#if image !== null}
                    <img src={image.src} alt="uploaded file" />
                {/if}
            </image-preview>

            <button onclick={() => reset?.()}>Reset</button>
        </image-upload>

        <color-difference-method>
            <h3>Color difference method</h3>
            <label>
                <input
                    type="radio"
                    bind:group={colorDifferenceMethod}
                    value={ColorDifferenceMethod.RgbDistance}
                />
                RGB
            </label>

            <label>
                <input
                    type="radio"
                    bind:group={colorDifferenceMethod}
                    value={ColorDifferenceMethod.LightnessDistance}
                />
                Lightness
            </label>
        </color-difference-method>

        <color-palette>
            <h3>Color palette</h3>

            <div>
                <label>
                    <input
                        type="radio"
                        bind:group={colorPaletteMode}
                        value={ColorPaletteMode.Any}
                    />
                    Any colors
                </label>

                <label>
                    <input
                        type="radio"
                        bind:group={colorPaletteMode}
                        value={ColorPaletteMode.Specified}
                    />
                    Specified colors
                </label>
            </div>

            <colors-list class:disabled={colorPaletteMode === ColorPaletteMode.Any}>
                {#each colorPalette as color, i}
                    <color-option>
                        <label>
                            <input
                                type="color"
                                bind:value={colorPalette[i]}
                            />

                            {color}
                        </label>

                        <button onclick={() => {
                            colorPalette.splice(i, 1);
                        }}>&#x00d7;</button>
                    </color-option>
                {/each}

                <button onclick={() => {
                    colorPalette.push(randomColor());
                }}>+</button>
            </colors-list>
        </color-palette>
    </control-panel>

    <canvas-container>
        <Canvas
            onStatusChange={(text) => (status = text)}
            onErr={(text) => (err = text)}
            referenceBitmap={image?.bitmap ?? null}
            {colorPaletteMode}
            {colorDifferenceMethod}
            {colorPalette}
            bind:optimizer
            bind:reset
        />
    </canvas-container>
</main>

<style lang="scss">
main {
    height: 100vh;
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    align-items: stretch;
    place-items: center;
    padding: 1rem;
    gap: 1rem;

    background: repeating-linear-gradient(
        45deg,
        oklch(0 0 0 / 0) 0,
        oklch(0 0 0 / 0) 1rem,
        oklch(0.9 0.05 190 / 0.125) 1rem,
        oklch(0.9 0.05 190 / 0.125) 2rem,
    );
}

control-panel {
    display: flex;
    flex-direction: column;
}

image-preview {
    display: block;
    background: oklch(0.9 0 0);
}

image-preview,
image-preview > img {
    width: 6rem;
    height: 6rem;
}

img {
    object-fit: contain;
}

colors-list {
    display: flex;
    flex-direction: column;

    &.disabled {
        opacity: 0.3;
        pointer-events: none;
    }
}

status-text {
    display: block;
    width: 40ch;
}

h3 {
    margin-bottom: 0.25rem;
}
</style>
