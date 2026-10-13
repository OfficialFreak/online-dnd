<script lang="ts">
    /**
     * Darkens what the figures don't see, over the whole map. What they see keeps the
     * map's own look, lights only decide what that is. A small picture the browser
     * stretches softly: Safari's canvas has no blur.
     */
    let {
        width,
        height,
        shade,
    }: {
        width: number;
        height: number;
        shade: ImageData;
    } = $props();

    let shade_canvas: HTMLCanvasElement | undefined = $state();

    $effect(() => {
        if (shade_canvas) shade_canvas.getContext("2d")?.putImageData(shade, 0, 0);
    });
</script>

<canvas
    bind:this={shade_canvas}
    {width}
    {height}
    class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
    aria-hidden="true"
></canvas>
