<script lang="ts">
    import { onMount } from "svelte";
    import { appState } from "../../routes/state.svelte";

    let { file, columns, x_offset, y_offset, fog_squares } = $props();
    let gridCanvas: any = $state();
    let ctx: CanvasRenderingContext2D | null = $state(null);
    let w = $state(0);
    let h = $state(0);
    
    
    let size = $derived(w / columns);
    let rows = $derived(Math.ceil(h / size) + 1);
    let map_url = $derived(`${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets/${file}?key=${appState.token}`);

    $effect(() => {
        if (ctx) {
            ctx.clearRect(0, 0, w, h);
            // Draw Fog

            for (let x = 0; x < columns; x++) {
                for (let y = 0; y < rows; y++) {
                    if (fog_squares && !fog_squares.some(([vx, vy]: [number, number]) => vx === x && vy === y)) continue;
                    ctx.beginPath();
                    ctx.rect(size * x + x_offset, size * y + y_offset, size, size);
                    ctx.fillStyle = "black";
                    ctx.fill();
                }
            }

            // Draw Grid

            ctx.beginPath();

            for (let i = 1; i < columns; i++) {
                ctx.moveTo(size * i + x_offset, 0 + y_offset);
                ctx.lineTo(size * i + x_offset, (rows - 1) * size + y_offset);
            }
            
            for (let i = 1; i < rows - 1; i++) {
                ctx.moveTo(0 + x_offset, size * i + y_offset);
                ctx.lineTo(w + x_offset, size * i + y_offset);
            }

            ctx.strokeStyle = "black";
            ctx.stroke();
        }
    });

    onMount(() => {
        ctx = gridCanvas.getContext("2d");
    });
</script>

<div class="w-full relative select-none">
    <img src={map_url} alt="Map" class="w-full" data-ambient />
    <canvas bind:this={gridCanvas} bind:clientWidth={w} bind:clientHeight={h} width={w as number} height={h as number} class="absolute top-0 left-0 w-full h-full z-0"></canvas>
</div>