<script lang="ts">
    import { onMount } from "svelte";
    import { appState, DMName, fogState, gameState, largeMouse, mouseDown, mouseX, mouseY, showMouse, Tools } from "../../routes/state.svelte";
    // @ts-ignore
    import throttle from 'just-throttle';
    import debounce from "just-debounce-it";
    import { fade } from "svelte/transition";
    import { MarkerFreed, MarkerLocked, MarkerPosition, MouseLarge, MousePosition, PutScene } from "$lib/types/messaging/client_messages";
    import { type DragOptions } from "@neodrag/svelte";
    import Marker from "./Marker.svelte";
    import { MessageTypes, notify } from "../../routes/notifications.svelte";

    let { file, columns, x_offset, y_offset, fog_squares, markers, editable = false } = $props();
    let gridCanvas: any = $state();
    let fogCanvas: any = $state();
    let gridCtx: CanvasRenderingContext2D | null = $state(null);
    let fogCtx: CanvasRenderingContext2D | null = $state(null);
    let w = $state(0);
    let h = $state(0);
    
    let size = $derived(w / columns);
    let rows = $derived(Math.ceil(h / size) + 1);
    $effect(() => {
        // @ts-ignore
        gameState.scene.rows = rows;
    });
    let map_url = $derived(getAssetUrl(file) || "");
    function getAssetUrl(asset: string) {
        if (!appState.token) return;
        return `${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets/${asset}?key=${encodeURIComponent(appState.token)}`;
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
        if (fogCtx && fog_squares) {
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
        if (!gameState.scene) return;
        let marker = gameState.scene.state.markers.find((marker) => marker.name === currentNode.id);
        if (!appState.ws || !marker) return;
        marker.x.set(offsetX / w, {duration: 0});
        marker.y.set(offsetY / h, {duration: 0});
        appState.ws.send(MarkerPosition.create(currentNode.id, offsetX / w, offsetY / h));
    }, 30, {leading: false, trailing: true});

    function saveSceneFog() {
        if (!appState.ws || !gameState.scene) return;
        appState.ws.send(PutScene.update_fog(gameState.scene.state.fog_squares));
        notify("Nebel aktualisiert", MessageTypes.Success, 1000);
    }

    let debounced_fog_save = debounce(saveSceneFog, 500);

    function clickHandler(event: MouseEvent, click: boolean) {
        let currentMouseX = event.pageX / w;
        // 30px is the margin from the titlebar (that offsetTop somehow doesn't get)
        let currentMouseY = (event.pageY - 30) / h;
        let x = Math.floor((event.pageX - x_offset) / size);
        // 30px is the margin from the titlebar (that offsetTop somehow doesn't get)
        let y = Math.floor((event.pageY - y_offset - 30) / size);

        if (!click && editable && appState.selected_tool === Tools.Pointer && gameState.dm && !appState.dragging) {
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
            debounced_fog_save();
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
        legacyTranslate: false
    }

    let translate_thingy = $derived(appState.zoom > 1 ? 50 * (1 - 1/appState.zoom) : 0);
    $effect(() => {
        if (editable && appState.zoom !== appState.prev_zoom) {
            // Calculate zoom ratio
            const zoomRatio = appState.zoom / appState.prev_zoom;
            
            // Get current scroll position
            const scrollTop = document.documentElement.scrollTop;
            const scrollLeft = document.documentElement.scrollLeft;
            
            // Calculate viewport center point
            const viewportCenterX = w / 2;
            const viewportCenterY = h / 2;
            
            // Calculate new scroll position to maintain center point
            const newScrollLeft = (scrollLeft + viewportCenterX) * zoomRatio - viewportCenterX;
            const newScrollTop = (scrollTop + viewportCenterY) * zoomRatio - viewportCenterY;
            
            // Apply new scroll position
            document.documentElement.scrollTop = newScrollTop;
            document.documentElement.scrollLeft = newScrollLeft;
        }
    });
</script>

<div class="w-full relative select-none overflow-hidden" style="transform: scale({editable ? appState.zoom : 1}) translate({editable ? translate_thingy : 0}%, {editable ? translate_thingy : 0}%)">
    <img src={map_url} alt="Map" class="w-full" />
    <canvas 
        bind:this={gridCanvas}
        bind:clientWidth={w}
        bind:clientHeight={h}
        onmousedown={(evt) => {clickHandler(evt, true)}}
        onmousemove={(evt) => {clickHandler(evt, false)}}
        onclick={(evt) => {
            if (!appState.ws) return;
            if(evt.button === 0 && appState.selected_tool === Tools.Pointer) {
                appState.ws.send(MouseLarge.create()) ;
            }
        }}
        width={w as number}
        height={h as number}
        class="absolute top-0 left-0 w-full h-full z-0 opacity-50">
    </canvas>
    <div class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none">
        {#each markers as marker}
            <Marker marker={marker} dragOptions={{...dragOptions, position: {
                x: marker.x.current * w, 
                y: marker.y.current * h
            }, disabled: !!gameState.locked_markers[marker.name]}} columnCount={columns} />
        {/each}
    </div>
    <canvas 
        bind:this={fogCanvas}
        width={w as number}
        height={h as number}
        class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        style="opacity: {gameState.dm ? '60' : '100'}%">
    </canvas>
    {#if showMouse.value && !mouse_in_fog && !gameState.dm}
    <div transition:fade class="absolute pointer-events-none top-0 left-0 origin-top-left" style="transform: translate({mouseX.current * w}px, {mouseY.current * h}px) scale({largeMouse.value ? '2' : '1'});">
        <i class="fa-solid fa-arrow-pointer"></i>
        <span class="badge badge-xs">{DMName.value}</span>
    </div>
    {/if}
</div>