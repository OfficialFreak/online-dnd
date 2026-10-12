<script lang="ts">
    import type { Sight } from "$lib/lighting";

    /**
     * Darkens what the figures don't see and greys what only darkvision shows, over the
     * whole map. A small picture the browser stretches softly: Safari's canvas has no blur.
     */
    let { sight }: { sight: Sight } = $props();

    let shade: HTMLCanvasElement;
    let grey: HTMLCanvasElement | undefined = $state();

    $effect(() => {
        shade.getContext("2d")?.putImageData(sight.shade, 0, 0);
    });

    $effect(() => {
        if (grey && sight.grey) grey.getContext("2d")?.putImageData(sight.grey, 0, 0);
    });
</script>

{#if sight.grey}
    <!-- Takes the colour of what is under it -->
    <canvas
        bind:this={grey}
        width={sight.width}
        height={sight.height}
        class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        style="mix-blend-mode: saturation"
        aria-hidden="true"
    ></canvas>
{/if}
<canvas
    bind:this={shade}
    width={sight.width}
    height={sight.height}
    class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
    aria-hidden="true"
></canvas>
