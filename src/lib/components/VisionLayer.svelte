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

    // A near flash of lightning lights up what lies in the dark for a moment, flickering
    // with it, see WeatherLayer.svelte. The fog the DM lays stays.
    $effect(() => {
        const on_reveal = (event: Event) => {
            const light = (event as CustomEvent<number[]>).detail;
            if (!shade_canvas || !light.length) return;
            shade_canvas.animate(
                light.map((bright) => ({ opacity: 1 - Math.min(0.92, bright * 1.1) })),
                { duration: light.length * 30, easing: "linear" },
            );
        };
        window.addEventListener("lightning-reveal", on_reveal);
        return () => window.removeEventListener("lightning-reveal", on_reveal);
    });
</script>

<canvas
    bind:this={shade_canvas}
    {width}
    {height}
    class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
    aria-hidden="true"
></canvas>
