<script lang="ts">
import Canvas from "$lib/components/Canvas.svelte";
    import ImageUpload from "$lib/components/ImageUpload.svelte";
    import { untrack } from "svelte";

let status = $state("");
let err = $state<string | null>(null);

let image: {
    src: string,
    bitmap: ImageBitmap,
} | null = $state(null);
</script>

<main>
    <image-upload>
        <ImageUpload
            onImageChange={async file => {
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
                <img
                    src={image.src}
                    alt="uploaded file"
                />
            {/if}
        </image-preview>
    </image-upload>

    <canvas-container>
        <Canvas
            onStatusChange={text => status = text}
            onErr={text => err = text}
            referenceBitmap={image?.bitmap ?? null}
        />
    </canvas-container>
</main>

<style lang="scss">
main {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    gap: 1rem;
}

image-preview > img {
    width: 6rem;
    height: 6rem;
    object-fit: contain;
}
</style>