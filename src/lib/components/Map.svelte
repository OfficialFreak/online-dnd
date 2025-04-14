<script lang="ts">
    import { onMount } from "svelte";
    import { appState, DMName, fogState, gameState, mouseDown, mouseX, mouseY, showMouse, Tools } from "../../routes/state.svelte";
    // @ts-ignore
    import throttle from 'just-throttle';
    import { fade } from "svelte/transition";
    import { MarkerFreed, MarkerLocked, MarkerPosition, MousePosition } from "$lib/types/messaging/client_messages";
    import { draggable, type DragOptions } from "@neodrag/svelte";

    let { file, columns, x_offset, y_offset, fog_squares, markers, editable = false } = $props();
    let gridCanvas: any = $state();
    let fogCanvas: any = $state();
    let gridCtx: CanvasRenderingContext2D | null = $state(null);
    let fogCtx: CanvasRenderingContext2D | null = $state(null);
    let w = $state(0);
    let h = $state(0);
    
    let size = $derived(w / columns);
    let rows = $derived(Math.ceil(h / size) + 1);
    let map_url = $derived(getAssetUrl(file));
    function getAssetUrl(asset: string) {
        return `${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets/${asset}?key=${encodeURIComponent(appState.token || "")}`;
    }

    let fogImg = new Image(0, 0);
    fogImg.src = "fog.jpg"
    let fogPattern: CanvasPattern | null = $state(null);
    fogImg.onload = () => {
        if (!fogCtx) return;
        const pattern = fogCtx.createPattern(fogImg, "repeat");
        if (pattern) {
            fogPattern = pattern;
        }
    };
    $effect(() => {
        if (!fogCtx) return;
        const pattern = fogCtx.createPattern(fogImg, "repeat");
        if (pattern) {
            fogPattern = pattern;
        }
    });

    $effect(() => {
        if (fogCtx) {
            fogCtx.globalCompositeOperation = "source-over";
            fogCtx.clearRect(0, 0, w, h);
            // Draw Fog

            fogCtx.beginPath();
            for (const [x, y] of fog_squares) {
                fogCtx.rect(size * x + x_offset, size * y + y_offset, size, size);
            }
            fogCtx.fillStyle = "#cccccc";
            fogCtx.fill();

            if (fogPattern && !(mouseDown.value && (appState.selected_tool === Tools.AddFog || appState.selected_tool === Tools.RemoveFog))) {
                fogCtx.globalCompositeOperation = "source-in";
                fogCtx.fillStyle = fogPattern;
                fogCtx.filter = "blur(5px)";
                fogCtx.fillRect(-5, -5, w + 10 , h + 10);
                fogCtx.filter = "none";
            }
        }
        if (gridCtx) {
            gridCtx.clearRect(0, 0, w, h);
            // Draw Grid

            gridCtx.beginPath();

            for (let i = 1; i < columns; i++) {
                gridCtx.moveTo(size * i + x_offset, 0 + y_offset);
                gridCtx.lineTo(size * i + x_offset, (rows - 1) * size + y_offset);
            }
            
            for (let i = 1; i < rows - 1; i++) {
                gridCtx.moveTo(0 + x_offset, size * i + y_offset);
                gridCtx.lineTo(w + x_offset, size * i + y_offset);
            }

            gridCtx.strokeStyle = "black";
            gridCtx.stroke();
        }
    });

    let mouse_in_fog = $derived(gameState.scene && gameState.scene.state.fog_squares[gameState.name].some(([sx, sy]) => sx === Math.floor((mouseX.current * w - x_offset) / size) && sy === Math.floor((mouseY.current * h - y_offset) / size)));

    let throttled = throttle((x: number, y: number) => {
        appState.ws?.send(MousePosition.create(x, y));
    }, 30, {leading: false, trailing: true});

    let throttledMarkerDrag = throttle(({ offsetX, offsetY, currentNode }) => {
        if (!appState.ws || !gameState.scene) return;
        appState.ws.send(MarkerPosition.create(currentNode.id, offsetX / w, offsetY / h));
    }, 30, {leading: false, trailing: true});

    function clickHandler(event: MouseEvent, click: boolean) {
        let currentMouseX = event.pageX / w;
        // 30px is the margin from the titlebar (that offsetTop somehow doesn't get)
        let currentMouseY = (event.pageY - 30) / h;
        let x = Math.floor((event.pageX - x_offset) / size);
        // 30px is the margin from the titlebar (that offsetTop somehow doesn't get)
        let y = Math.floor((event.pageY - y_offset - 30) / size);

        if (!click && editable && appState.selected_tool === Tools.Pointer && gameState.dm) {
            throttled(currentMouseX, currentMouseY);
        }

        if ((!mouseDown.value && !click) || !editable || !gameState.scene) return;
            
        if (appState.selected_tool === Tools.AddFog || appState.selected_tool === Tools.RemoveFog) {
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
    }

    onMount(() => {
        gridCtx = gridCanvas.getContext("2d");
        fogCtx = fogCanvas.getContext("2d");
    });

    let dragOptions: DragOptions = {
        onDragStart: ({currentNode}) => {
            appState.dragging = true;
            if (!appState.ws) return;
            appState.ws.send(MarkerLocked.create(currentNode.id));
        },
        onDragEnd: ({offsetX, offsetY, currentNode}) => {
            if (!gameState.scene) return;
            let marker = gameState.scene.state.markers.find((marker) => marker.name === currentNode.id);
            if (!marker) return;
            marker.x.set(offsetX / w, {duration: 0});
            marker.y.set(offsetY / h, {duration: 0});
            appState.dragging = false;
            if (!appState.ws) return;
            if(!gameState.scene) return;
            appState.ws.send(MarkerFreed.create(currentNode.id, offsetX / w, offsetY / h));
        },
        bounds: 'parent',
        onDrag: throttledMarkerDrag,
    }
</script>

<div class="w-full relative select-none overflow-hidden">
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
    <div class="absolute top-0 left-0 w-full h-full z-0" style="pointer-events: {(appState.selected_tool === Tools.Pointer || appState.selected_tool === Tools.None) ? "auto": "none"}">
        {#each markers as marker}
        <div 
            use:draggable={{...dragOptions, position: {x: marker.x.current * w, y: marker.y.current * h}, disabled: !!gameState.locked_markers[marker.name]}}
            id={marker.name}
            class="avatar absolute top-0 left-0"
        >
            {#if gameState.locked_markers[marker.name]}
                <span class="absolute top-0 right-0 badge badge-info z-10" transition:fade={{duration: 100}}>
                    <i class="fa-solid fa-up-down-left-right"></i>
                    {gameState.locked_markers[marker.name]}
            </span>
            {/if}
            <div class="mask mask-hexagon p-1 pointer-events-none" style="width: {marker.size}vw">
                <img
                    alt="Marker"
                    src={getAssetUrl(marker.file)}
                    class="mask mask-hexagon"
                />
            </div>
        </div>
        {/each}
    </div>
    <canvas 
        bind:this={fogCanvas}
        width={w as number}
        height={h as number}
        class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        style="opacity: {gameState.dm ? '80' : '100'}%">
    </canvas>
    {#if showMouse.value && !mouse_in_fog && !gameState.dm}
    <div transition:fade class="absolute pointer-events-none top-0 left-0" style="transform: translate({mouseX.current * w}px, {mouseY.current * h}px);">
        <i class="fa-solid fa-arrow-pointer"></i>
        <span class="badge badge-xs">{DMName.value}</span>
    </div>
    {/if}
</div>