<script lang="ts">
    /**
     * Darkens what the figures don't see, greys what only darkvision shows and lets
     * coloured lights glow, over the whole map. Small pictures the browser stretches
     * softly: Safari's canvas has no blur.
     */
    let {
        width,
        height,
        shade = null,
        grey = null,
        tint = null,
    }: {
        width: number;
        height: number;
        shade?: ImageData | null;
        grey?: ImageData | null;
        tint?: ImageData | null;
    } = $props();

    let shade_canvas: HTMLCanvasElement | undefined = $state();
    let grey_canvas: HTMLCanvasElement | undefined = $state();
    let tint_canvas: HTMLCanvasElement | undefined = $state();

    $effect(() => {
        if (shade && shade_canvas) shade_canvas.getContext("2d")?.putImageData(shade, 0, 0);
    });

    $effect(() => {
        if (grey && grey_canvas) grey_canvas.getContext("2d")?.putImageData(grey, 0, 0);
    });

    $effect(() => {
        if (tint && tint_canvas) tint_canvas.getContext("2d")?.putImageData(tint, 0, 0);
    });
</script>

{#if grey}
    <!-- Takes the colour of what is under it -->
    <canvas
        bind:this={grey_canvas}
        {width}
        {height}
        class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        style="mix-blend-mode: saturation"
        aria-hidden="true"
    ></canvas>
{/if}
{#if tint}
    <!-- Lights what is under it in their colour -->
    <canvas
        bind:this={tint_canvas}
        {width}
        {height}
        class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        style="mix-blend-mode: screen"
        aria-hidden="true"
    ></canvas>
{/if}
{#if shade}
    <canvas
        bind:this={shade_canvas}
        {width}
        {height}
        class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        aria-hidden="true"
    ></canvas>
{/if}
