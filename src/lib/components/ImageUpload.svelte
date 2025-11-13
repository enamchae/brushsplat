<script lang="ts">
const {
    onImageChange,
}: {
    onImageChange: (file: File) => void,
} = $props();


let input: HTMLInputElement;
const handleInput = async () => {
    if (input.files === null || input.files.length === 0) return;

    onImageChange(input.files[0]);
};

</script>

<input
    type="file"
    accept="image/*"
    bind:this={input}
    oninput={handleInput}
/>