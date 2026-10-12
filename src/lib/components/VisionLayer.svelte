<script lang="ts">
    import type { Point } from "$lib/vision";

    /**
     * Darkens what the figures don't see, over the whole map. The polygons are what they
     * see, in cells.
     */
    let {
        polygons,
        columns,
        rows,
    }: { polygons: Point[][]; columns: number; rows: number } = $props();

    let canvas: HTMLCanvasElement;
    // About 16 pixels per cell, stretched softly by the browser: the edges look smooth
    // without a blur, which Safari's canvas doesn't have
    let width = $derived(Math.max(1, Math.min(2048, Math.round(columns * 16))));
    let height = $derived(
        Math.max(1, Math.round((width * rows) / Math.max(1, columns))),
    );

    $effect(() => {
        const ctx = canvas.getContext("2d");
        if (!ctx || !columns || !rows) return;
        const scale_x = width / columns;
        const scale_y = height / rows;
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "rgba(6, 8, 14, 0.62)";
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "#000";
        for (const polygon of polygons) {
            if (polygon.length < 3) continue;
            ctx.beginPath();
            ctx.moveTo(polygon[0][0] * scale_x, polygon[0][1] * scale_y);
            for (let i = 1; i < polygon.length; i++) {
                ctx.lineTo(polygon[i][0] * scale_x, polygon[i][1] * scale_y);
            }
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
    });
</script>

<canvas
    bind:this={canvas}
    {width}
    {height}
    class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
    aria-hidden="true"
></canvas>
