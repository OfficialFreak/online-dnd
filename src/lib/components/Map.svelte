<script lang="ts">
    import { onMount } from "svelte";
    import { appState, fogState, gameState, mouseDown, Tools } from "../../routes/state.svelte";

    let { file, columns, x_offset, y_offset, fog_squares, editable = false } = $props();
    let gridCanvas: any = $state();
    let ctx: CanvasRenderingContext2D | null = $state(null);
    let w = $state(0);
    let h = $state(0);
    
    
    let size = $derived(w / columns);
    let rows = $derived(Math.ceil(h / size) + 1);
    let map_url = $derived(`${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets/${file}?key=${encodeURIComponent(appState.token || "")}`);

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

    function clickHandler(event: MouseEvent, click: boolean) {
        if ((!mouseDown.value && !click) || !editable) return;
        let x = Math.floor((event.pageX - x_offset) / size);
        // 30px is the margin from the titlebar (that offsetTop somehow doesn't get)
        let y = Math.floor((event.pageY - y_offset - 30) / size);

        if (!gameState.scene) return;
        let edit_players = fogState.selected_player === "all" ? gameState.users.map((user) => user.name) : [fogState.selected_player]

        for (const player of edit_players) {
            gameState.scene.state.fog_squares[player] ??= [];
            if (appState.selected_tool === Tools.AddFog && !gameState.scene.state.fog_squares[player].some(([sx, sy]) => sx === x && sy === y)) {
                gameState.scene.state.fog_squares[player].push([x, y]);
            } else if (appState.selected_tool === Tools.RemoveFog) {
                let idx = gameState.scene.state.fog_squares[player].findIndex(([sx, sy]) => sx === x && sy === y);
                if (idx === -1) return;
                gameState.scene.state.fog_squares[player].splice(idx, 1);
            }
        }
    }

    onMount(() => {
        ctx = gridCanvas.getContext("2d");
    });
</script>

<div class="w-full relative select-none">
    <img src={map_url} alt="Map" class="w-full" />
    <canvas 
        bind:this={gridCanvas}
        bind:clientWidth={w}
        bind:clientHeight={h}
        width={w as number}
        height={h as number}
        onmousedown={(evt) => {clickHandler(evt, true)}}
        onmousemove={(evt) => {clickHandler(evt, false)}}
        class="absolute top-0 left-0 w-full h-full z-0">
    </canvas>
</div>