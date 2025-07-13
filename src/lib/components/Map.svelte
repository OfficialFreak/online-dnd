<script lang="ts">
    import { onMount } from "svelte";
    import {
        appState,
        fogState,
        gameState,
        mouseX,
        mouseY,
        Tools,
    } from "../state.svelte";
    // @ts-ignore
    import throttle from "just-throttle";
    import debounce from "just-debounce-it";
    import { draggable } from "@neodrag/svelte";

    import { invoke } from "@tauri-apps/api/core";
    import { fade } from "svelte/transition";
    import {
        MarkerFreed,
        MarkerLocked,
        MouseLarge,
        PutScene,
    } from "$lib/types/messaging/client_messages";
    import { type DragOptions } from "@neodrag/svelte";
    import Marker from "./Marker.svelte";
    import { MessageTypes, notify } from "../notifications.svelte";

    let {
        file,
        columns,
        set_rows = () => {},
        x_offset,
        y_offset,
        fog_squares,
        markers,
        editable = false,
    } = $props();
    let gridCanvas: any = $state();
    let fogCanvas: any = $state();
    let gridCtx: CanvasRenderingContext2D | null = $state(null);
    let fogCtx: CanvasRenderingContext2D | null = $state(null);
    let w = $state(0);
    let h = $state(0);

    let size = $derived(w / columns);
    let grid: [number, number] = $derived([size, size]);
    let rows = $derived(Math.ceil(h / size) + 1);
    $effect(() => {
        if (!editable) return;
        set_rows(rows);
    });
    let map_url = $derived(getAssetUrl(file) || "");
    function getAssetUrl(asset: string) {
        if (!appState.token) return;
        return `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets/${asset}?key=${encodeURIComponent(appState.token)}`;
    }

    let fogImg = new Image(0, 0);
    fogImg.src = "fog.jpg";
    let fogPattern: CanvasPattern | null = $state(null);
    fogImg.onload = () => {
        if (!fogCtx) return;
        const pattern = fogCtx.createPattern(fogImg, "repeat");
        if (pattern) {
            fogPattern = pattern;
        }
    };
    $effect(() => {
        if (!fogCtx || !editable) return;
        const pattern = fogCtx.createPattern(fogImg, "repeat");
        if (pattern) {
            fogPattern = pattern;
        }
    });

    $effect(() => {
        if (!editable) return;
        appState.verticalSnapPoint = window.innerHeight / h;
    });

    function setFogAt(
        fog: Array<number>,
        x: number,
        y: number,
        state: boolean,
    ) {
        if (!fog || !columns) return false;

        let index = y * columns + x;
        let arrayIndex = Math.floor(index / 32);
        let bitIndex = index % 32;
        if (state) {
            fog[arrayIndex] |= 1 << (31 - bitIndex);
        } else {
            fog[arrayIndex] &= ~(1 << (31 - bitIndex));
        }
    }

    function isFogAt(fog: Array<number>, x: number, y: number) {
        const index = y * columns + x;
        return (fog[Math.floor(index / 32)] & (1 << (31 - (index % 32)))) !== 0;
    }

    $effect(() => {
        if (!editable) return;

        if (fogCtx && fog_squares && rows) {
            fogCtx.globalCompositeOperation = "source-over";
            fogCtx.clearRect(0, 0, w, h);

            // Draw Fog
            fogCtx.beginPath();
            for (let x = 0; x < columns; x++) {
                for (let y = 0; y < rows; y++) {
                    if (isFogAt(fog_squares, x, y)) {
                        fogCtx.rect(
                            size * x + x_offset,
                            size * y + y_offset,
                            size,
                            size,
                        );
                    }
                }
            }
            fogCtx.fillStyle = "#cccccc";
            fogCtx.fill();

            if (
                fogPattern &&
                !(
                    appState.mouseDown &&
                    (appState.selectedTool === Tools.AddFog ||
                        appState.selectedTool === Tools.RemoveFog)
                )
            ) {
                fogCtx.globalCompositeOperation = "source-in";
                fogCtx.fillStyle = fogPattern;
                fogCtx.filter = "blur(5px)";
                fogCtx.fillRect(-5, -5, w + 10, h + 10);
                fogCtx.filter = "none";
            }
        }
    });

    $effect(() => {
        if (gridCtx) {
            gridCtx.clearRect(0, 0, w, h);
            // Draw Grid

            gridCtx.beginPath();

            for (let i = 1; i < columns; i++) {
                gridCtx.moveTo(size * i + x_offset, 0 + y_offset);
                gridCtx.lineTo(
                    size * i + x_offset,
                    (rows - 1) * size + y_offset,
                );
            }

            for (let i = 1; i < rows - 1; i++) {
                gridCtx.moveTo(0 + x_offset, size * i + y_offset);
                gridCtx.lineTo(w + x_offset, size * i + y_offset);
            }

            gridCtx.strokeStyle = "black";
            gridCtx.stroke();
        }
    });

    let mouse_in_fog = $derived(
        gameState.scene &&
            isFogAt(
                fog_squares,
                Math.floor((mouseX.current * w - x_offset) / size),
                Math.floor((mouseY.current * h - y_offset) / size),
            ),
    );

    let throttled = throttle(
        (x: number, y: number) => {
            invoke("send_mouse_position", { x: x, y: y });
        },
        11, // 90 Hz
        { leading: false, trailing: true },
    );

    let throttledMarkerDrag = throttle(
        ({ offsetX, offsetY, currentNode }) => {
            if (!gameState.scene) return;
            let marker = gameState.scene.state.markers.find(
                (marker) => marker.name === currentNode.id,
            );
            if (!appState.ws || !marker) return;
            marker.x.set(offsetX / w, { duration: 0 });
            marker.y.set(offsetY / h, { duration: 0 });
            invoke("send_marker_position", {
                x: offsetX / w,
                y: offsetY / h,
                markerName: currentNode.id,
            });
        },
        11, // 90 Hz
        { leading: false, trailing: true },
    );

    function saveSceneFog() {
        if (!appState.ws || !gameState.scene) return;
        appState.ws.send(
            PutScene.update_fog(gameState.scene.state.fog_squares),
        );
        notify("Nebel aktualisiert", MessageTypes.Success, 1000);
    }

    let debounced_fog_save = debounce(saveSceneFog, 500);

    let ruler_rotation = $state(0);

    function clickHandler(event: MouseEvent, click: boolean) {
        if (!editable) return;
        let currentMouseX = event.offsetX / w;
        // 30px is the margin from the titlebar (that offsetTop somehow doesn't get)
        let currentMouseY = event.offsetY / h;
        let x = Math.floor((event.offsetX - x_offset) / size);
        // 30px is the margin from the titlebar (that offsetTop somehow doesn't get)
        let y = Math.floor((event.offsetY - y_offset) / size);

        if (
            !click &&
            editable &&
            appState.selectedTool === Tools.Pointer &&
            gameState.dm &&
            !appState.dragging
        ) {
            throttled(currentMouseX, currentMouseY);
        } else if (
            !click &&
            editable &&
            rotate_active &&
            appState.selectedTool === Tools.Ruler &&
            ruler
        ) {
            let { top, left, bottom } = ruler.getBoundingClientRect();
            let height = bottom - top;
            let x = left;
            let y = top + height / 2;

            let x_difference =
                (event.offsetX - document.documentElement.scrollLeft) *
                    appState.zoom -
                x +
                document.documentElement.scrollLeft;
            let y_difference =
                (event.offsetY - document.documentElement.scrollTop) *
                    appState.zoom -
                y +
                document.documentElement.scrollTop;
            let alpha =
                (Math.atan(y_difference / x_difference) * 360) / (2 * Math.PI);
            ruler_rotation = alpha;
        }

        if ((!appState.mouseDown && !click) || !editable || !gameState.scene)
            return;

        if (
            appState.selectedTool === Tools.AddFog ||
            appState.selectedTool === Tools.RemoveFog
        ) {
            let edit_players =
                fogState.selected_player === "all"
                    ? gameState.users.map((user) => user.name)
                    : [fogState.selected_player];
            for (const player of edit_players) {
                if (!gameState.scene.state.fog_squares[player]) {
                    gameState.scene.state.fog_squares[player] =
                        new Array<number>(Math.ceil((columns * rows) / 32));
                    gameState.scene.state.fog_squares[player].fill(0);
                }
                if (
                    appState.selectedTool === Tools.AddFog &&
                    !isFogAt(gameState.scene.state.fog_squares[player], x, y)
                ) {
                    setFogAt(
                        gameState.scene.state.fog_squares[player],
                        x,
                        y,
                        true,
                    );
                } else if (
                    appState.selectedTool === Tools.RemoveFog &&
                    isFogAt(gameState.scene.state.fog_squares[player], x, y)
                ) {
                    setFogAt(
                        gameState.scene.state.fog_squares[player],
                        x,
                        y,
                        false,
                    );
                }
            }
            debounced_fog_save();
        }
    }

    onMount(() => {
        gridCtx = gridCanvas.getContext("2d");
        if (!editable) return;
        fogCtx = fogCanvas.getContext("2d");
    });

    let dragOptions: DragOptions = $derived({
        onDragStart: ({ currentNode }) => {
            appState.dragging = true;
            if (!appState.ws) return;
            appState.ws.send(MarkerLocked.create(currentNode.id));
        },
        onDragEnd: ({ offsetX, offsetY, currentNode }) => {
            if (!gameState.scene) return;
            let marker = gameState.scene.state.markers.find(
                (marker) => marker.name === currentNode.id,
            );
            if (!marker) return;
            marker.x.set(offsetX / w, { duration: 0 });
            marker.y.set(offsetY / h, { duration: 0 });
            appState.dragging = false;
            if (!appState.ws) return;
            if (!gameState.scene) return;
            appState.ws.send(
                MarkerFreed.create(currentNode.id, offsetX / w, offsetY / h),
            );
        },
        bounds: "parent",
        onDrag: throttledMarkerDrag,
        legacyTranslate: false,
        grid: appState.ctrlPressed ? grid : undefined,
    });

    let translate_thingy = $derived(
        appState.zoom > 1 ? 50 * (1 - 1 / appState.zoom) : 0,
    );
    $effect(() => {
        if (editable && appState.zoom !== appState.prevZoom) {
            // Calculate zoom ratio
            const zoomRatio = appState.zoom / appState.prevZoom;

            // Get current scroll position
            const scrollTop = document.documentElement.scrollTop;
            const scrollLeft = document.documentElement.scrollLeft;

            // Calculate viewport center point
            const viewportCenterX = w / 2;
            const viewportCenterY = h / 2;

            // Calculate new scroll position to maintain center point
            const newScrollLeft =
                (scrollLeft + viewportCenterX) * zoomRatio - viewportCenterX;
            const newScrollTop =
                (scrollTop + viewportCenterY) * zoomRatio - viewportCenterY;

            // Apply new scroll position
            document.documentElement.scrollTop = newScrollTop;
            document.documentElement.scrollLeft = newScrollLeft;
        }
    });

    let ruler: any = $state(null);
    let rotate_active = $state(false);

    function rulerRotate() {
        rotate_active = true;
    }

    $effect(() => {
        if (!editable) return;
        if (!appState.mouseDown) {
            rotate_active = false;
        }
    });

    $effect(() => {
        if (!editable) return;
        if (!ruler) return;
        ruler.style.rotate = `${ruler_rotation}deg`;
    });

    let ruler_width = $state(20);
</script>

<div
    class="w-full relative select-none overflow-hidden"
    style="transform: scale({editable ? appState.zoom : 1}) translate({editable
        ? translate_thingy
        : 0}%, {editable ? translate_thingy : 0}%)"
>
    <img
        src={map_url}
        alt="Map"
        class="w-full"
        fetchpriority={editable ? "high" : "auto"}
    />
    <canvas
        bind:this={gridCanvas}
        bind:clientWidth={w}
        bind:clientHeight={h}
        onmousedown={(evt) => {
            if (!editable) return;
            clickHandler(evt, true);
        }}
        onmousemove={(evt) => {
            if (!editable) return;
            clickHandler(evt, false);
        }}
        onclick={(evt) => {
            if (!appState.ws || !editable) return;
            if (evt.button === 0 && appState.selectedTool === Tools.Pointer) {
                appState.ws.send(MouseLarge.create());
            }
        }}
        width={w as number}
        height={h as number}
        class="absolute top-0 left-0 w-full h-full z-0 opacity-50"
    >
    </canvas>
    {#if editable}
        <div
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        >
            {#each markers as marker}
                <Marker
                    {marker}
                    dragOptions={{
                        ...dragOptions,
                        position: {
                            x: marker.x.current * w,
                            y: marker.y.current * h,
                        },
                        disabled: !!gameState.lockedMarkers[marker.name],
                    }}
                    columnCount={columns}
                />
            {/each}
        </div>
        <canvas
            bind:this={fogCanvas}
            width={w as number}
            height={h as number}
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
            style="opacity: {gameState.dm ? '60' : '100'}%"
        >
        </canvas>
        {#if gameState.showMouse && !mouse_in_fog && !gameState.dm}
            <div
                transition:fade
                class="absolute pointer-events-none top-0 left-0 origin-top-left"
                style="transform: translate({mouseX.current *
                    w}px, {mouseY.current * h}px) scale({gameState.largeMouse
                    ? '2'
                    : '1'});"
            >
                <i class="fa-solid fa-arrow-pointer"></i>
                <span class="badge badge-xs">{gameState.DMName}</span>
            </div>
        {/if}
        {#if appState.selectedTool === Tools.Ruler}
            <div
                role="banner"
                class="absolute top-1/2 left-1/2"
                use:draggable={{ handle: ".handle" }}
                onmousemove={(evt) => {
                    clickHandler(evt, false);
                }}
            >
                <div
                    bind:this={ruler}
                    bind:clientWidth={ruler_width}
                    class="origin-center block h-8 w-50 bg-base-100 text-white overflow-auto resize-x"
                >
                    <div class="absolute bottom-0 h-full w-full handle"></div>
                    <button
                        aria-label="Rotate Handle"
                        class="absolute top-1/2 right-0 -translate-y-1/2 w-4 h-full bg-base-300"
                        onmousedown={rulerRotate}
                    ></button>
                    <span
                        class="absolute top-0 left-0 w-full h-full flex justify-center items-center pointer-events-none"
                    >
                        {Math.round((ruler_width / size) * 50) / 10}
                        <i class="ml-2 fa-solid fa-shoe-prints text-xs"></i>
                    </span>
                </div>
            </div>
        {/if}
    {/if}
</div>
