<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
    import {
        activate_scene,
        add_marker,
        appState,
        record_undo,
        selection,
        drawState,
        fogState,
        gameState,
        pointers,
        type Pointer,
        Tools,
        wallState,
    } from "../state.svelte";
    import { dropTarget, type DragPayload } from "$lib/drag.svelte";
    // @ts-ignore
    import throttle from "just-throttle";
    import debounce from "just-debounce-it";
    import { send_marker_position, send_pointer } from "$lib/live";
    import { fade } from "svelte/transition";
    import {
        AddDrawing,
        DeleteDrawings,
        MarkerFreed,
        MarkerLocked,
        MouseLarge,
        PutScene,
        PutWalls,
        SetDoor,
    } from "$lib/types/messaging/client_messages";
    import {
        visibility_polygon,
        wall_segments,
        WallIndex,
        type Door,
        type Point,
        type Segment,
        type Wall,
    } from "$lib/vision";
    import VisionLayer from "./VisionLayer.svelte";
    import {
        compute_sight,
        compute_tint,
        light_base,
        LIGHT_PRESETS,
        lit_at,
        preset_of,
        scene_lights,
        SEEN,
        seen_at,
        type Eye,
        type Lamp,
        type Lighting,
        type SceneLight,
        type Sight,
    } from "$lib/lighting";
    import {
        drawing_shape,
        shape_contains,
        type Drawing,
    } from "$lib/drawings";
    import { type DragOptions } from "@neodrag/svelte";
    import Marker from "./Marker.svelte";
    import { MessageTypes, notify } from "../notifications.svelte";
    import Display from "./Display.svelte";
    // @ts-ignore
    import confetti from "canvas-confetti";
    import { billows, smoothstep } from "$lib/noise";
    import { FOG_TEXTURE_SCALE, fog_texture } from "$lib/fog-texture";

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
    let fogCanvas: any = $state();
    let fogCtx: CanvasRenderingContext2D | null = $state(null);
    let w = $state(0);
    let h = $state(0);

    let size = $derived(w / columns);
    let grid: [number, number] = $derived([size, size]);
    let rows = $derived(Math.ceil(h / size) + 1);
    $effect(() => {
        set_rows(rows);
    });

    /**
     * Pixels of the fog canvas per pixel of the map: sharp on high-DPI screens, but small
     * enough for phones, whose browsers refuse very large canvases
     */
    let fog_resolution = $derived(
        Math.min(
            window.devicePixelRatio || 1,
            Math.sqrt(8_000_000 / Math.max(1, w * h)),
        ),
    );

    let ruler_origin: { x: null | number; y: null | number } = $state({
        x: null,
        y: null,
    });
    $effect(() => {
        if (appState.selectedTool !== Tools.Ruler) {
            ruler_origin = { x: null, y: null };
        }
    });
    let ruler_size: null | number = $state(null);
    let ruler_angle: null | number = $state(null);

    /** The fog's texture, blurred once, see fog-texture */
    let fogTexture: HTMLCanvasElement | null = $state(null);
    $effect(() => {
        if (editable) fog_texture().then((texture) => (fogTexture = texture));
    });
    let fogPattern: CanvasPattern | null = $state(null);
    $effect(() => {
        if (!fogCtx || !editable || !fogTexture) return;
        fogPattern = fogCtx.createPattern(fogTexture, "repeat");
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

    function isFogAt(fog: Array<number> | undefined, x: number, y: number) {
        if (!fog || x < 0 || y < 0 || x >= columns) return false;
        const index = y * columns + x;
        return (fog[Math.floor(index / 32)] & (1 << (31 - (index % 32)))) !== 0;
    }

    /** The fog drawn last, of which scene and player, to see what changed since */
    let last_fog: { key: string; squares: number[] } | null = null;
    let fog_fades: HTMLDivElement | undefined = $state();

    /** Fog drifting in or apart over some cells, a copy of it torn by noise */
    type FogFade = {
        cells: number[];
        adding: boolean;
        /** The fog of the cells, drawn like the fog */
        source: HTMLCanvasElement;
        shown: HTMLCanvasElement;
        mask: HTMLCanvasElement;
        wisps: ImageData;
        start: number;
        duration: number;
        /** Where in the noise, so fades next to each other don't look alike */
        seed: number;
    };
    let fog_anims: FogFade[] = [];
    let fog_frame = 0;
    /** Cells whose fog is still drifting in: the fog canvas leaves them to their fade */
    const arriving = new Set<number>();
    /** Counts up when arriving fog has settled, to draw it on the fog canvas */
    let fog_settled = $state(0);

    function cell_of(index: number): [number, number] {
        return [index % columns, Math.floor(index / columns)];
    }

    /**
     * Fog drifts in or apart instead of appearing or vanishing at once: a copy of it over
     * the cells, drawn like the fog, torn by drifting noise.
     */
    function fade_fog(cells: number[], adding: boolean, quick: boolean) {
        if (!fog_fades || !rows || !w || !h || !cells.length) return;
        // Only around the cells
        const pad = size / 2;
        const xs = cells.map((index) => cell_of(index)[0]);
        const ys = cells.map((index) => cell_of(index)[1]);
        const left = Math.max(0, size * Math.min(...xs) + x_offset - pad);
        const top = Math.max(0, size * Math.min(...ys) + y_offset - pad);
        const right = Math.min(w, size * (Math.max(...xs) + 1) + x_offset + pad);
        const bottom = Math.min(h, size * (Math.max(...ys) + 1) + y_offset + pad);
        if (right <= left || bottom <= top) return;

        const source = document.createElement("canvas");
        source.width = Math.max(1, Math.round((right - left) * fog_resolution));
        source.height = Math.max(1, Math.round((bottom - top) * fog_resolution));
        const ctx = source.getContext("2d")!;
        // In the map's coordinates like the fog, so its texture lines up
        ctx.setTransform(
            fog_resolution,
            0,
            0,
            fog_resolution,
            -left * fog_resolution,
            -top * fog_resolution,
        );
        ctx.beginPath();
        for (const index of cells) {
            const [x, y] = cell_of(index);
            ctx.rect(size * x + x_offset, size * y + y_offset, size, size);
        }
        ctx.fillStyle = "#cccccc";
        ctx.fill();
        const pattern = fogTexture && ctx.createPattern(fogTexture, "repeat");
        if (pattern) {
            ctx.globalCompositeOperation = "source-in";
            pattern.setTransform(new DOMMatrix().scale(layout_zoom * FOG_TEXTURE_SCALE));
            ctx.fillStyle = pattern;
            ctx.fillRect(left - 5, top - 5, right - left + 10, bottom - top + 10);
        }

        const shown = document.createElement("canvas");
        shown.width = source.width;
        shown.height = source.height;
        Object.assign(shown.style, {
            position: "absolute",
            left: `${(left / w) * 100}%`,
            top: `${(top / h) * 100}%`,
            width: `${((right - left) / w) * 100}%`,
            height: `${((bottom - top) / h) * 100}%`,
        });
        fog_fades.append(shown);
        // Up to ten noise pixels a cell, the browser smooths them out. A big area gets
        // coarser wisps, not more work. Without the moving effects it only fades.
        const per_cell = appState.motion
            ? Math.min(10, (160 * size) / Math.max(right - left, bottom - top))
            : 0;
        const mask = document.createElement("canvas");
        mask.width = Math.max(1, Math.round(((right - left) / size) * per_cell));
        mask.height = Math.max(1, Math.round(((bottom - top) / size) * per_cell));
        if (adding) for (const index of cells) arriving.add(index);
        fog_anims.push({
            cells,
            adding,
            source,
            shown,
            mask,
            wisps: new ImageData(mask.width, mask.height),
            start: performance.now(),
            // Quick while the DM paints, so the brush keeps up
            duration: !appState.motion ? 500 : quick ? 1100 : adding ? 1500 : 2000,
            seed: Math.random() * 100,
        });
        if (!fog_frame) fog_frame = requestAnimationFrame(animate_fog);
    }

    function end_fade(fade: FogFade) {
        fade.shown.remove();
        if (!fade.adding) return;
        for (const index of fade.cells) arriving.delete(index);
        fog_settled++;
    }

    function animate_fog(now: number) {
        fog_anims = fog_anims.filter((fade) => {
            const progress = Math.min(1, (now - fade.start) / fade.duration);
            if (progress >= 1) {
                end_fade(fade);
                return false;
            }
            const { mask, wisps, shown } = fade;
            const time = (now - fade.start) / 1000;
            if (mask.width > 1 || mask.height > 1) {
                // Gaps open where the noise is low first, or the fog gathers there first
                const level = progress * 1.3 - 0.15;
                for (let y = 0; y < mask.height; y++) {
                    for (let x = 0; x < mask.width; x++) {
                        const gaps = billows(
                            x * 0.09 + time * 0.35 + fade.seed,
                            y * 0.09 - time * 0.2 + fade.seed,
                        );
                        const gone = smoothstep(gaps - 0.15, gaps + 0.15, level);
                        wisps.data[(y * mask.width + x) * 4 + 3] =
                            255 * (fade.adding ? gone : 1 - gone);
                    }
                }
            } else {
                wisps.data[3] = 255 * (fade.adding ? progress : 1 - progress);
            }
            mask.getContext("2d")!.putImageData(wisps, 0, 0);
            const ctx = shown.getContext("2d")!;
            ctx.globalCompositeOperation = "copy";
            ctx.drawImage(fade.source, 0, 0);
            ctx.globalCompositeOperation = "destination-in";
            ctx.drawImage(mask, 0, 0, shown.width, shown.height);
            return true;
        });
        fog_frame = fog_anims.length ? requestAnimationFrame(animate_fog) : 0;
    }

    /** What changed since the fog drawn last fades in or apart */
    function fade_changes(before: number[], after: number[], quick: boolean) {
        const added: number[] = [];
        const removed: number[] = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
                const was = isFogAt(before, x, y);
                const is = isFogAt(after, x, y);
                if (was !== is) (is ? added : removed).push(y * columns + x);
            }
        }
        // Fog taken away again while it drifted in stops drifting in
        if (removed.some((index) => arriving.has(index))) {
            fog_anims = fog_anims.filter((fade) => {
                if (!fade.adding || !fade.cells.some((index) => removed.includes(index))) {
                    return true;
                }
                end_fade(fade);
                return false;
            });
        }
        fade_fog(added, true, quick);
        fade_fog(removed, false, quick);
    }

    // A scene or player switched to has its fog at once, with nothing drifting
    function stop_fog_fades() {
        for (const fade of fog_anims) fade.shown.remove();
        fog_anims = [];
        arriving.clear();
    }

    $effect(() => {
        if (!editable) return;
        fog_settled;

        // The blur is left out while painting. The tool goes first: reading
        // mouseDown would redraw the fog on every click anywhere.
        const painting =
            (appState.selectedTool === Tools.AddFog ||
                appState.selectedTool === Tools.RemoveFog) &&
            appState.mouseDown;

        // What changed since fades in or apart, before the fog canvas leaves out what
        // drifts in
        if (fog_squares && rows) {
            const key = untrack(() => `${gameState.scene?.name}|${viewer}|${columns}`);
            const before = last_fog;
            last_fog = { key, squares: [...fog_squares] };
            if (before?.key === key && !document.hidden) {
                untrack(() => fade_changes(before.squares, fog_squares!, painting));
            } else if (before?.key !== key) {
                untrack(stop_fog_fades);
            }
        }

        if (fogCtx) {
            // Setting the canvas size resets the transform
            fog_resolution;
            fogCtx.setTransform(fog_resolution, 0, 0, fog_resolution, 0, 0);
            fogCtx.globalCompositeOperation = "source-over";
            fogCtx.clearRect(0, 0, w, h);
        }

        if (fogCtx && fog_squares && rows) {

            // Draw Fog
            fogCtx.beginPath();
            for (let x = 0; x < columns; x++) {
                for (let y = 0; y < rows; y++) {
                    if (
                        isFogAt(fog_squares, x, y) &&
                        !arriving.has(y * columns + x)
                    ) {
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

            if (fogPattern && !painting) {
                fogCtx.globalCompositeOperation = "source-in";
                // The texture grows with the map, like at the zoom it was made for
                fogPattern.setTransform(
                    new DOMMatrix().scale(layout_zoom * FOG_TEXTURE_SCALE),
                );
                fogCtx.fillStyle = fogPattern;
                fogCtx.fillRect(-5, -5, w + 10, h + 10);
            }
        }
    });

    // Players don't see pointers in their fog, DMs see through the fog anyway
    // Without a name it comes from an older DM client
    function pointer_is_dm(name: string) {
        return (
            !name || gameState.users.some((user) => user.name === name && user.dm)
        );
    }

    function pointer_in_fog(pointer: Pointer) {
        return (
            !gameState.dm &&
            isFogAt(
                fog_squares,
                Math.floor((pointer.x.current * w - x_offset) / size),
                Math.floor((pointer.y.current * h - y_offset) / size),
            )
        );
    }

    let throttled = throttle(
        (x: number, y: number) => {
            send_pointer(x, y);
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
            send_marker_position(offsetX / w, offsetY / h, currentNode.id);
            move_group(offsetX / w, offsetY / h, false);
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

    /**
     * Where an event happened on the map, in its pixels before the zoom. From the client
     * position, offsetX of a finger outside the element differs between browsers.
     */
    function local(event: { clientX: number; clientY: number }) {
        const rect = map_element!.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * w,
            y: ((event.clientY - rect.top) / rect.height) * h,
        };
    }

    function clickHandler(event: PointerEvent, click: boolean) {
        if (!editable) return;
        const point = local(event);
        let currentMouseX = point.x / w;
        let currentMouseY = point.y / h;
        let x = Math.floor((point.x - x_offset) / size);
        let y = Math.floor((point.y - y_offset) / size);

        if (
            !click &&
            editable &&
            appState.selectedTool === Tools.Pointer &&
            !appState.dragging
        ) {
            throttled(currentMouseX, currentMouseY);
        }

        if (
            editable &&
            ruler_origin.x !== null &&
            ruler_origin.y !== null &&
            appState.selectedTool === Tools.Ruler
        ) {
            // Calculate Length of Ruler
            ruler_size =
                Math.sqrt(
                    ((point.x - x_offset) / size - ruler_origin.x) ** 2 +
                        ((point.y - y_offset) / size - ruler_origin.y) ** 2,
                ) * size;
            // Calculate angle ruler should be at
            ruler_angle = Math.atan2(
                (point.y - y_offset) / size - ruler_origin.y,
                (point.x - x_offset) / size - ruler_origin.x,
            );
        }

        if (
            !editable ||
            !gameState.scene ||
            (appState.selectedTool !== Tools.AddFog &&
                appState.selectedTool !== Tools.RemoveFog)
        )
            return;

        // The rectangle and the brush stay on the grid when the mouse leaves it
        const cell_x = Math.min(Math.max(x, 0), columns - 1);
        const cell_y = Math.min(Math.max(y, 0), rows - 1);

        if (click) {
            // The right button is for menus
            if (event.button !== 0) return;
            // One undo step per fog stroke
            record_undo();
            if (fogState.shape === "rect" || event.shiftKey) {
                // The rectangle is filled when the mouse is released
                fog_rect = { x1: cell_x, y1: cell_y, x2: cell_x, y2: cell_y };
                on_release(finish_fog_rect);
                return;
            }
            brush_cell = [cell_x, cell_y];
            on_release(() => (brush_cell = null));
            paint_brush([brush_cell]);
            return;
        }

        if (fog_rect) {
            fog_rect.x2 = cell_x;
            fog_rect.y2 = cell_y;
        } else if (brush_cell) {
            // Quick moves skip cells, the brush also goes over the ones in between
            paint_brush(cells_between(brush_cell, [cell_x, cell_y]));
            brush_cell = [cell_x, cell_y];
        }
    }

    /** The cell the brush is on during a stroke */
    let brush_cell: [number, number] | null = null;

    /** The cells on a straight line from one cell to another, without the first */
    function cells_between(
        [x1, y1]: [number, number],
        [x2, y2]: [number, number],
    ) {
        const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        const cells: [number, number][] = [];
        for (let step = 1; step <= steps; step++) {
            cells.push([
                Math.round(x1 + ((x2 - x1) * step) / steps),
                Math.round(y1 + ((y2 - y1) * step) / steps),
            ]);
        }
        return cells;
    }

    /** Paints the brush, which may be wider than one cell, around these cells */
    function paint_brush(centers: [number, number][]) {
        if (centers.length === 0) return;
        const reach = Math.floor((fogState.brush - 1) / 2);
        const cells: [number, number][] = [];
        for (const [x, y] of centers) {
            for (let dx = -reach; dx <= reach; dx++) {
                for (let dy = -reach; dy <= reach; dy++) {
                    cells.push([x + dx, y + dy]);
                }
            }
        }
        paint_fog(cells);
    }

    /** The drawing being drawn, the others only see it when it's done */
    let drawing: Drawing | null = $state(null);
    let drawings: Drawing[] = $derived(
        editable ? (gameState.scene?.state.drawings ?? []) : [],
    );
    let shown_drawings = $derived(drawing ? [...drawings, drawing] : drawings);

    /**
     * Calls done when the mouse or finger is released, also outside of the map. Not an
     * effect on appState.mouseDown: the body only sets it after the map's mousedown, and
     * Svelte runs effects in between, so it would end what just started.
     */
    function on_release(done: () => void) {
        const finish = () => {
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            done();
        };
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
    }

    /** Ctrl or the snap switch of the drawing menu, phones and tablets have no Ctrl */
    let snapping = $derived(appState.ctrlPressed || drawState.snap);

    function start_drawing(event: PointerEvent) {
        if (event.button !== 0 || !editable) return;
        let { x: px, y: py } = local(event);
        // Ctrl starts at a corner of the grid
        if (snapping) {
            px = Math.round((px - x_offset) / size) * size + x_offset;
            py = Math.round((py - y_offset) / size) * size + y_offset;
        }
        drawing = {
            id: crypto.randomUUID(),
            kind: drawState.kind,
            color: drawState.color,
            x: px / w,
            y: py / h,
            x2: px / w,
            y2: py / h,
            points: drawState.kind === "free" ? [[px / w, py / h]] : undefined,
        };
        on_release(finish_drawing);
    }

    function continue_drawing(event: PointerEvent) {
        if (!drawing) return;
        const { x: px, y: py } = local(event);
        if (drawing.kind === "free") {
            const points = drawing.points!;
            const [last_x, last_y] = points[points.length - 1];
            if (
                Math.hypot(px - last_x * w, py - last_y * h) >= 3 &&
                points.length < 1000
            ) {
                points.push([px / w, py / h]);
            }
            return;
        }
        // Spell areas grow freely, with Ctrl in steps of 5 ft like the grid
        const snap = snapping;
        const ax = drawing.x * w;
        const ay = drawing.y * h;
        const dx = px - ax;
        const dy = py - ay;
        if (drawing.kind === "square") {
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            const length = snap
                ? Math.max(1, Math.round(side / size)) * size
                : side;
            drawing.x2 = (ax + (Math.sign(dx) || 1) * length) / w;
            drawing.y2 = (ay + (Math.sign(dy) || 1) * length) / h;
            return;
        }
        const length = Math.hypot(dx, dy);
        if (length === 0) return;
        const scale = snap
            ? (Math.max(1, Math.round(length / size)) * size) / length
            : 1;
        drawing.x2 = (ax + dx * scale) / w;
        drawing.y2 = (ay + dy * scale) / h;
    }

    function finish_drawing() {
        if (!drawing) return;
        const done: Drawing = $state.snapshot(drawing);
        drawing = null;
        const big_enough =
            done.kind === "free"
                ? (done.points?.length ?? 0) > 1
                : Math.hypot((done.x2 - done.x) * w, (done.y2 - done.y) * h) >=
                  size / 2;
        if (!big_enough || !gameState.scene) return;
        gameState.scene.state.drawings = [
            ...(gameState.scene.state.drawings ?? []),
            { ...done, owner: gameState.name },
        ];
        appState.ws?.send(AddDrawing.create(done));
    }

    /**
     * Right click or a long press deletes the drawing at this point of the map, players can
     * only delete theirs. Returns whether there was one.
     */
    function delete_drawing_at(x: number, y: number) {
        const hit = drawings
            .toReversed()
            .find(
                (drawing) =>
                    (gameState.dm || drawing.owner === gameState.name) &&
                    shape_contains(
                        drawing_shape(drawing, w, h, size).shape,
                        x,
                        y,
                        Math.max(6, size * 0.2),
                    ),
            );
        if (hit) appState.ws?.send(DeleteDrawings.create({ ids: [hit.id] }));
        return !!hit;
    }

    // Touch: one finger uses the tool, a second one turns it into a pinch. The fog waits
    // for the finger to move, so the first finger of a pinch doesn't paint.
    const fingers = new Set<number>();
    let waiting_fog: PointerEvent | null = null;
    let long_press: ReturnType<typeof setTimeout> | undefined;
    let press_start = { x: 0, y: 0 };
    /** How far a finger may move and still count as holding still, in screen pixels */
    const HOLD_STILL = 8;
    /** A mouse sets the ruler's start with a click, a finger while it touches */
    let last_pointer = "mouse";

    /** Drops what a finger started, e.g. when a second one starts a pinch */
    function cancel_stroke() {
        drawing = null;
        fog_rect = null;
        brush_cell = null;
        waiting_fog = null;
        wall_tap = null;
        door_start = null;
        clearTimeout(long_press);
        if (appState.selectedTool === Tools.Ruler) {
            ruler_origin = { x: null, y: null };
            ruler_size = null;
        }
    }

    function tool_down(event: PointerEvent) {
        if (!editable) return;
        if (event.pointerType === "touch") {
            // The first finger of a touch, a lost pointerup must not count forever
            if (event.isPrimary) fingers.clear();
            fingers.add(event.pointerId);
            if (fingers.size > 1) {
                cancel_stroke();
                return;
            }
            press_start = { x: event.clientX, y: event.clientY };
            const tool = appState.selectedTool;
            // A finger measures while it moves, a mouse from one click to the next
            if (tool === Tools.Ruler) {
                const point = local(event);
                ruler_origin = {
                    x: (point.x - x_offset) / size,
                    y: (point.y - y_offset) / size,
                };
                ruler_size = null;
                return;
            }
            if (tool === Tools.AddFog || tool === Tools.RemoveFog) {
                waiting_fog = event;
                return;
            }
            if (tool === Tools.Draw) {
                const point = local(event);
                clearTimeout(long_press);
                long_press = setTimeout(() => {
                    if (delete_drawing_at(point.x, point.y)) drawing = null;
                }, 600);
            }
            if (tool === Tools.Walls && wallState.mode !== "door") {
                wall_tap = event;
                return;
            }
        }
        if (appState.selectedTool === Tools.Walls) {
            wall_down(event);
            return;
        }
        if (appState.selectedTool === Tools.Draw) start_drawing(event);
        clickHandler(event, true);
    }

    function tool_move(event: PointerEvent) {
        if (!editable) return;
        if (event.pointerType === "touch") {
            if (fingers.size > 1) return;
            const moved =
                Math.hypot(
                    event.clientX - press_start.x,
                    event.clientY - press_start.y,
                ) > HOLD_STILL;
            if (moved) {
                clearTimeout(long_press);
                wall_tap = null;
            }
            if (waiting_fog) {
                if (!moved) return;
                const start = waiting_fog;
                waiting_fog = null;
                clickHandler(start, true);
            }
        }
        if (appState.selectedTool === Tools.Walls) {
            wall_move(event);
            return;
        }
        if (appState.selectedTool === Tools.Draw) continue_drawing(event);
        clickHandler(event, false);
    }

    function tool_up(event: PointerEvent) {
        clearTimeout(long_press);
        fingers.delete(event.pointerId);
        if (wall_tap && event.type === "pointerup") wall_down(wall_tap);
        wall_tap = null;
        // A tap paints a single spot
        if (waiting_fog && event.type === "pointerup") {
            const start = waiting_fog;
            waiting_fog = null;
            clickHandler(start, true);
        }
        waiting_fog = null;
        finish_fog_rect();
        finish_drawing();
    }

    /** A rectangle of fog being drawn, in cells */
    let fog_rect: { x1: number; y1: number; x2: number; y2: number } | null =
        $state(null);

    function finish_fog_rect() {
        if (!fog_rect) return;
        const cells: [number, number][] = [];
        for (
            let x = Math.min(fog_rect.x1, fog_rect.x2);
            x <= Math.max(fog_rect.x1, fog_rect.x2);
            x++
        ) {
            for (
                let y = Math.min(fog_rect.y1, fog_rect.y2);
                y <= Math.max(fog_rect.y1, fog_rect.y2);
                y++
            ) {
                cells.push([x, y]);
            }
        }
        fog_rect = null;
        paint_fog(cells);
    }

    /** Adds or removes fog in these cells for the players being edited */
    function paint_fog(cells: [number, number][]) {
        if (!gameState.scene) return;
        const add = appState.selectedTool === Tools.AddFog;
        let edit_players =
            fogState.selected_player === "all"
                ? gameState.users.map((user) => user.name)
                : [fogState.selected_player];
        for (const player of edit_players) {
            if (!gameState.scene.state.fog_squares[player]) {
                gameState.scene.state.fog_squares[player] = new Array<number>(
                    Math.ceil((columns * rows) / 32),
                );
                gameState.scene.state.fog_squares[player].fill(0);
            }
            const fog = gameState.scene.state.fog_squares[player];
            for (const [x, y] of cells) {
                if (x < 0 || x >= columns || y < 0 || y >= rows) continue;
                if (isFogAt(fog, x, y) !== add) setFogAt(fog, x, y, add);
            }
        }
        debounced_fog_save();
    }

    onMount(() => {
        if (!editable) return;
        fogCtx = fogCanvas.getContext("2d");
        // The canvas keeps the size of the map at 100%, zoomed in it would get huge
        appState.map_confetti_function = confetti.create(confetti_canvas, {
            resize: false,
        });
    });

    type SceneMarker = NonNullable<typeof gameState.scene>["state"]["markers"][number];

    /** The other selected markers that move along with the dragged one, and where they started */
    let group: { marker: SceneMarker; x: number; y: number }[] = [];
    let group_origin: { x: number; y: number } | null = null;

    function start_group(name: string) {
        group = [];
        group_origin = null;
        const scene = gameState.scene;
        if (!gameState.dm || !scene || !selection.has(name)) return;
        const dragged = scene.state.markers.find((marker) => marker.name === name);
        if (!dragged) return;
        group_origin = { x: dragged.x.target, y: dragged.y.target };
        group = scene.state.markers
            .filter((marker) => marker.name !== name && selection.has(marker.name))
            .map((marker) => ({ marker, x: marker.x.target, y: marker.y.target }));
        for (const { marker } of group) {
            appState.ws?.send(MarkerLocked.create(marker.name));
        }
    }

    /** x and y are where the dragged marker is, as fractions of the map */
    function move_group(x: number, y: number, final: boolean) {
        if (!group_origin) return;
        for (const member of group) {
            const width = member.marker.size / columns;
            const new_x = Math.min(
                Math.max(member.x + x - group_origin.x, 0),
                1 - width,
            );
            const new_y = Math.min(
                Math.max(member.y + y - group_origin.y, 0),
                1 - (width * w) / h,
            );
            member.marker.x.set(new_x, { duration: 0 });
            member.marker.y.set(new_y, { duration: 0 });
            if (final) {
                appState.ws?.send(
                    MarkerFreed.create(member.marker.name, new_x, new_y),
                );
            } else {
                send_marker_position(new_x, new_y, member.marker.name);
            }
        }
        if (final) {
            group = [];
            group_origin = null;
        }
    }

    let dragOptions: DragOptions = $derived({
        onDragStart: ({ currentNode }) => {
            appState.dragging = true;
            appState.open_marker_menu = null;
            record_undo();
            start_group(currentNode.id);
            if (!appState.ws) return;
            appState.ws.send(MarkerLocked.create(currentNode.id));
        },
        onDragEnd: ({ offsetX, offsetY, currentNode }) => {
            // Reset first: the marker may have been deleted or renamed mid-drag,
            // and the hidden UI and the lock for others must not get stuck
            appState.dragging = false;
            let marker = gameState.scene?.state.markers.find(
                (marker) => marker.name === currentNode.id,
            );
            marker?.x.set(offsetX / w, { duration: 0 });
            marker?.y.set(offsetY / h, { duration: 0 });

            appState.ws?.send(
                MarkerFreed.create(currentNode.id, offsetX / w, offsetY / h),
            );
            move_group(offsetX / w, offsetY / h, true);
        },
        bounds: "parent",
        // Selecting text or clicking in a marker's menu doesn't move the marker
        cancel: ".dropdown-content",
        onDrag: throttledMarkerDrag,
        legacyTranslate: false,
        grid: appState.ctrlPressed ? grid : undefined,
    });

    // The map is laid out at the zoom, so the image, grid and markers are drawn sharp.
    // Laying it out on every step of a pinch would stutter, so during a zoom gesture it is
    // only scaled and shifted, and laid out anew once the gesture ends. The gesture doesn't
    // scroll the page either: Safari applies scrolling during a touch late, the next step
    // then corrected the old position again and the map jumped back and forth.
    let layout_zoom = $derived(editable ? appState.layout_zoom : 1);
    let gesture_scale = $derived(editable ? appState.zoom / layout_zoom : 1);
    /** Where a gesture moved the map to, in screen pixels, until it becomes scrolling */
    let shift_x = $state(0);
    let shift_y = $state(0);
    /**
     * The size of the page when the gesture started. A map scaled down during it would
     * make the page smaller, the browser would scroll back and the map jump with it.
     */
    let keep_page: { width: number; height: number } | null = $state(null);
    /** Size of the map at 100%, w and h grow with the layout zoom */
    let base_w = $derived(w / layout_zoom);
    let base_h = $derived(h / layout_zoom);
    let pinching = false;
    let settle_timer: ReturnType<typeof setTimeout> | undefined;

    /** Lays the map out at the zoom and turns the shift into scrolling, after a gesture */
    function settle_later() {
        clearTimeout(settle_timer);
        settle_timer = setTimeout(settle, 200);
    }

    function settle() {
        if (pinching) return;
        const scroll_x = window.scrollX - shift_x;
        const scroll_y = window.scrollY - shift_y;
        if (appState.zoom !== appState.layout_zoom) {
            // The new size right away, the browser measures it only after the next frame,
            // and markers placed by the old one would flash in the wrong spot
            const ratio = appState.zoom / appState.layout_zoom;
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
            appState.layout_zoom = appState.zoom;
        }
        keep_page = null;
        if (shift_x === 0 && shift_y === 0) return;
        shift_x = 0;
        shift_y = 0;
        // Once the new layout is there, in the same frame
        tick().then(() => window.scrollTo(scroll_x, scroll_y));
    }

    $effect(() => {
        if (!editable) return;
        if (appState.zoom !== appState.layout_zoom) settle_later();
    });

    // Zooming in makes the page scrollable to the right and bottom. Below 100% the map
    // shrinks towards its center, and a map taller than the window towards the middle
    // of the window, not of its own height, which would put it far down.
    let window_w = $state(0);
    let window_h = $state(0);
    function centered(size: number, room: number) {
        const zoom = appState.zoom;
        if (!editable || zoom >= 1) return 0;
        return Math.min(
            (size * (1 - zoom)) / 2,
            Math.max(0, (room - size * zoom) / 2),
        );
    }
    /**
     * Room the title bar takes above the page. Read on every zoom step it made the browser
     * work out all styles anew, it only changes with the window and the folded controls.
     */
    let titlebar_room = $state(30);
    $effect(() => {
        window_w;
        window_h;
        appState.controls_open;
        requestAnimationFrame(() => {
            titlebar_room = parseFloat(getComputedStyle(document.body).marginTop) || 30;
        });
    });
    let zoom_offset_x = $derived(centered(base_w, window_w));
    let zoom_offset_y = $derived(centered(base_h, window_h - titlebar_room));
    let map_element: HTMLDivElement | null = $state(null);

    $effect(() => {
        if (editable && w && h) appState.map_aspect = h / w;
    });

    const MIN_ZOOM = 0.3;
    /**
     * In until a square is about two thumbs wide, at least fivefold: on a phone the squares
     * of a big map stayed an eighth of a thumb at five
     */
    let max_zoom = $derived(
        Math.min(40, Math.max(5, 140 / Math.max(0.5, base_w / Math.max(1, columns)))),
    );

    /**
     * Where the map is without the zoom's centering and the gesture's shift, from where it
     * is on the screen now
     */
    function unshifted_position() {
        const rect = map_element!.getBoundingClientRect();
        return {
            rect,
            left: rect.left - zoom_offset_x - shift_x,
            top: rect.top - zoom_offset_y - shift_y,
        };
    }

    /**
     * Shifts the map so that this point of it, as fractions of the map, lies under this
     * point of the screen at the current zoom
     */
    function keep_under(
        point: { x: number; y: number },
        client_x: number,
        client_y: number,
        unshifted: { left: number; top: number },
    ) {
        // Still the page as it was before this step, the DOM changes afterwards
        keep_page ??= {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
        };
        shift_x =
            client_x -
            point.x * base_w * appState.zoom -
            unshifted.left -
            zoom_offset_x;
        shift_y =
            client_y -
            point.y * base_h * appState.zoom -
            unshifted.top -
            zoom_offset_y;

        // Only as far as scrolling can take it once the gesture ends, otherwise the map
        // would jump there. Zoomed out it can't scroll and stays in the middle.
        const zoom = appState.zoom;
        const right =
            unshifted.left + window.scrollX + zoom_offset_x + base_w * zoom;
        const bottom =
            unshifted.top + window.scrollY + zoom_offset_y + base_h * zoom;
        const max_x = Math.max(0, right - document.documentElement.clientWidth);
        const max_y = Math.max(0, bottom - document.documentElement.clientHeight);
        shift_x = Math.min(Math.max(shift_x, window.scrollX - max_x), window.scrollX);
        shift_y = Math.min(Math.max(shift_y, window.scrollY - max_y), window.scrollY);
    }

    /**
     * Zooms so that the map point under (client_x, client_y) stays under it. Steps stop
     * at 100% and at "fills the window height", a pinch glides past them.
     */
    function zoom_to(new_zoom: number, client_x: number, client_y: number) {
        if (!map_element) return;
        const old_zoom = appState.zoom;
        new_zoom = Math.min(Math.max(new_zoom, MIN_ZOOM), max_zoom);
        // The tolerance keeps rounding errors from stopping again right after a stop
        const titlebar = titlebar_room;
        const fit_height = (window.innerHeight - titlebar) / base_h;
        for (const stop of [1, fit_height]) {
            const at_stop = Math.abs(old_zoom - stop) < 0.001;
            const passes = (old_zoom - stop) * (new_zoom - stop) < 0;
            if (Math.abs(new_zoom - stop) < 0.001 || (passes && !at_stop)) {
                new_zoom = stop;
            }
        }
        if (new_zoom === old_zoom) return;

        const unshifted = unshifted_position();
        const point = {
            x: (client_x - unshifted.rect.left) / unshifted.rect.width,
            y: (client_y - unshifted.rect.top) / unshifted.rect.height,
        };
        appState.zoom = new_zoom;
        keep_under(point, client_x, client_y, unshifted);
        settle_later();
    }

    $effect(() => {
        if (!editable) return;

        // Ctrl+wheel zooms. Touchpad pinches arrive as Ctrl+wheel too, but in many small
        // steps instead of the big steps of a mouse wheel. Without Ctrl, wheels and two
        // finger swipes scroll the page, which pans the zoomed map.
        const on_wheel = (event: WheelEvent) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            const delta =
                event.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? event.deltaY * 40
                    : event.deltaY;
            const factor =
                Math.abs(delta) >= 50
                    ? delta < 0
                        ? 1.15
                        : 1 / 1.15
                    : Math.exp(-delta / 100);
            zoom_to(appState.zoom * factor, event.clientX, event.clientY);
        };
        // Not passive, otherwise the whole window would zoom instead
        window.addEventListener("wheel", on_wheel, { passive: false });

        // On touch screens two fingers pinch and pan the map. One finger pans it like a
        // page, unless a tool is active, then it uses the tool.
        let pinch: {
            distance: number;
            zoom: number;
            /** The map point between the fingers, as fractions of the map */
            point: { x: number; y: number };
            unshifted: { left: number; top: number };
        } | null = null;
        const spread = (touches: TouchList) =>
            Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY,
            );
        const middle = (touches: TouchList) => ({
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        });
        const on_touch_start = (event: TouchEvent) => {
            if (event.touches.length !== 2 || !map_element) return;
            const unshifted = unshifted_position();
            const center = middle(event.touches);
            pinch = {
                distance: spread(event.touches),
                zoom: appState.zoom,
                point: {
                    x: (center.x - unshifted.rect.left) / unshifted.rect.width,
                    y: (center.y - unshifted.rect.top) / unshifted.rect.height,
                },
                unshifted,
            };
            pinching = true;
        };
        const on_touch_move = (event: TouchEvent) => {
            if (!pinch || event.touches.length !== 2) return;
            // Otherwise the browser zooms the whole page, toolbar and all
            event.preventDefault();
            const zoom = Math.min(
                Math.max(
                    (pinch.zoom * spread(event.touches)) / pinch.distance,
                    MIN_ZOOM,
                ),
                max_zoom,
            );
            appState.zoom = zoom;
            // The map point that was between the fingers stays between them
            const center = middle(event.touches);
            keep_under(pinch.point, center.x, center.y, pinch.unshifted);
        };
        const on_touch_end = (event: TouchEvent) => {
            if (event.touches.length >= 2) return;
            pinch = null;
            if (pinching) {
                pinching = false;
                settle_later();
            }
        };
        // Safari zooms the page with its own gesture events
        const on_gesture = (event: Event) => event.preventDefault();
        window.addEventListener("touchstart", on_touch_start, { passive: true });
        window.addEventListener("touchmove", on_touch_move, { passive: false });
        window.addEventListener("touchend", on_touch_end);
        window.addEventListener("touchcancel", on_touch_end);
        window.addEventListener("gesturestart", on_gesture);
        appState.zoom_by = (factor: number) =>
            zoom_to(
                appState.zoom * factor,
                window.innerWidth / 2,
                window.innerHeight / 2,
            );

        return () => {
            window.removeEventListener("wheel", on_wheel);
            window.removeEventListener("touchstart", on_touch_start);
            window.removeEventListener("touchmove", on_touch_move);
            window.removeEventListener("touchend", on_touch_end);
            window.removeEventListener("touchcancel", on_touch_end);
            window.removeEventListener("gesturestart", on_gesture);
            appState.zoom_by = null;
        };
    });

    // A tap next to the marker whose menu is open closes it
    $effect(() => {
        if (!editable) return;
        const close_menu = (event: PointerEvent) => {
            const open = appState.open_marker_menu;
            if (!open) return;
            if (document.getElementById(open)?.contains(event.target as Node)) return;
            appState.open_marker_menu = null;
        };
        window.addEventListener("pointerdown", close_menu, true);
        return () => window.removeEventListener("pointerdown", close_menu, true);
    });

    // Dragging with the middle mouse button pans the map
    let pan_start: { x: number; y: number } | null = null;

    /** Shift+dragging over the map selects the markers in the box, as fractions of the map */
    let box: { x1: number; y1: number; x2: number; y2: number } | null =
        $state(null);

    function map_fraction(event: PointerEvent) {
        const rect = map_element!.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height,
        };
    }

    function start_pan(event: PointerEvent) {
        if (!editable) return;
        const on_marker = (event.target as HTMLElement).closest(".avatar");
        if (
            event.button === 0 &&
            gameState.dm &&
            (appState.selectedTool === Tools.None ||
                appState.selectedTool === Tools.Select) &&
            !on_marker &&
            map_element
        ) {
            // The selection tool is Shift for phones and tablets
            if (!event.shiftKey && appState.selectedTool !== Tools.Select) {
                selection.clear();
                return;
            }
            // Only one finger draws the box, two pinch
            if (event.pointerType === "touch" && !event.isPrimary) {
                box = null;
                return;
            }
            const start = map_fraction(event);
            box = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
            (event.currentTarget as HTMLElement).setPointerCapture(
                event.pointerId,
            );
            return;
        }
        if (event.button !== 1) return;
        event.preventDefault();
        pan_start = { x: event.clientX, y: event.clientY };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    function pan(event: PointerEvent) {
        if (box) {
            const current = map_fraction(event);
            box.x2 = current.x;
            box.y2 = current.y;
            return;
        }
        if (!pan_start) return;
        window.scrollBy(pan_start.x - event.clientX, pan_start.y - event.clientY);
        pan_start = { x: event.clientX, y: event.clientY };
    }

    function end_pan() {
        pan_start = null;
        if (!box) return;
        const left = Math.min(box.x1, box.x2);
        const right = Math.max(box.x1, box.x2);
        const top = Math.min(box.y1, box.y2);
        const bottom = Math.max(box.y1, box.y2);
        // A tap next to the markers ends the selection, like a click without Shift
        if (
            appState.selectedTool === Tools.Select &&
            (right - left) * w < HOLD_STILL &&
            (bottom - top) * h < HOLD_STILL
        ) {
            selection.clear();
            box = null;
            return;
        }
        // Markers whose center is in the box
        for (const marker of markers) {
            const width = marker.size / columns;
            const center_x = marker.x.current + width / 2;
            const center_y = marker.y.current + (width * w) / h / 2;
            if (
                center_x >= left &&
                center_x <= right &&
                center_y >= top &&
                center_y <= bottom
            ) {
                selection.add(marker.name);
            }
        }
        box = null;
    }

    let rotate_active = $state(false);

    $effect(() => {
        if (!editable) return;
        if (!appState.mouseDown) {
            rotate_active = false;
        }
    });

    let player_markers = $derived(
        markers.filter((marker: any) =>
            gameState.characters.some((char) => char.name === marker.name),
        ),
    );
    let non_player_markers = $derived(
        markers.filter(
            (marker: any) =>
                !gameState.characters.some((char) => char.name === marker.name),
        ),
    );
    let confetti_canvas: HTMLCanvasElement | null = $state(null);

    /** Whether the center of a marker lies in the fog */
    function in_fog(marker: any) {
        const marker_px = (marker.size / columns) * w;
        return isFogAt(
            fog_squares,
            Math.floor((marker.x.current * w + marker_px / 2 - x_offset) / size),
            Math.floor((marker.y.current * h + marker_px / 2 - y_offset) / size),
        );
    }

    // Sight: walls and closed doors block what the players' figures see. It is worked
    // out in cells, the walls are stored as fractions of the map.
    let vision_on = $derived(editable && !!gameState.scene?.state.vision);
    /** The map's height in cells */
    /**
     * Rows of the map, from its shape. The sizes rounded after a zoom changed it in the
     * third decimal, which built the walls and every light anew: only a real change counts.
     */
    let map_rows = $state(0);
    $effect(() => {
        const now = w && h ? (columns * h) / w : 0;
        const known = untrack(() => map_rows);
        if (!now || Math.abs(now - known) > Math.max(0.05, known * 0.005)) {
            map_rows = Math.round(now * 1000) / 1000;
        }
    });
    /**
     * The props as plain values for the sight and the light. Read as props they are read
     * through the scene, and every scene the server sends anew, on each figure moved,
     * counted as a change: the walls and all lights were worked out again each time.
     */
    let grid_columns = $derived(columns);
    let grid_x_offset = $derived(x_offset);
    let grid_y_offset = $derived(y_offset);
    let walls: Wall[] = $derived(
        editable ? (gameState.scene?.state.walls ?? []) : [],
    );
    let doors: Door[] = $derived(
        editable ? (gameState.scene?.state.doors ?? []) : [],
    );
    /**
     * The walls and doors as text. The server sends the whole scene anew on every change,
     * e.g. each figure moved, with walls and lights as new objects: built from those, the
     * walls and every light were worked out anew each time, 70 ms on a big map. Now only
     * when they really changed.
     */
    let walls_key = $derived(
        vision_on && map_rows ? JSON.stringify([walls, doors, grid_columns, map_rows]) : "",
    );
    let segments = $derived.by(() => {
        if (!walls_key) return [];
        return untrack(() => wall_segments(walls, doors, grid_columns, map_rows));
    });
    let wall_index = $derived(
        vision_on && map_rows ? new WallIndex(segments, grid_columns, map_rows) : null,
    );

    /**
     * The outline of the viewer's fog, in cells: the DM's fog blocks their sight like a
     * wall, a fogged corridor hides the room behind it. Lights shine through, the fog only
     * hides things from the player.
     */
    let fog_key = $derived(fog_squares ? fog_squares.join(",") : "");
    let fog_edges: Segment[] = $derived.by(() => {
        if (!wall_index || !fog_key || !size) return [];
        const ox = grid_x_offset / size;
        const oy = grid_y_offset / size;
        const fog = untrack(() => fog_squares);
        const fogged = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < grid_columns && y < rows && isFogAt(fog, x, y);
        const edges: Segment[] = [];
        // Where a fogged cell meets a clear one, joined into runs along the grid
        for (let y = 0; y <= rows; y++) {
            let start = -1;
            for (let x = 0; x <= grid_columns; x++) {
                const edge = x < grid_columns && fogged(x, y) !== fogged(x, y - 1);
                if (edge && start < 0) start = x;
                if (!edge && start >= 0) {
                    edges.push([start + ox, y + oy, x + ox, y + oy]);
                    start = -1;
                }
            }
        }
        for (let x = 0; x <= grid_columns; x++) {
            let start = -1;
            for (let y = 0; y <= rows; y++) {
                const edge = y < rows && fogged(x, y) !== fogged(x - 1, y);
                if (edge && start < 0) start = y;
                if (!edge && start >= 0) {
                    edges.push([x + ox, start + oy, x + ox, y + oy]);
                    start = -1;
                }
            }
        }
        return edges;
    });
    /** The walls and the viewer's fog, for what the viewer's figures see */
    let sight_index = $derived(
        wall_index && fog_edges.length
            ? new WallIndex([...segments, ...fog_edges], grid_columns, map_rows)
            : wall_index,
    );
    /** Whose sight the map shows: the player's own, or the one the DM looks through */
    let viewer = $derived(
        gameState.dm
            ? fogState.selected_player === "all"
                ? null
                : fogState.selected_player
            : gameState.name,
    );
    let lighting: Lighting = $derived(gameState.scene?.state.lighting ?? "bright");
    let lights_key = $derived(
        editable ? JSON.stringify(gameState.scene?.state.lights ?? []) : "",
    );
    let lights: SceneLight[] = $derived.by(() => {
        if (!lights_key) return [];
        return untrack(() => scene_lights(gameState.scene?.state.lights));
    });

    /**
     * Keeps what was worked out from the same things: a new array of the same figures from
     * the server keeps the polygons, and what is drawn from them, as they were.
     */
    function same<T>(cache: { key: string; value: T | null }, key: string, make: () => T): T {
        if (cache.value !== null && cache.key === key) return cache.value;
        cache.key = key;
        cache.value = make();
        return cache.value;
    }
    const eyes_cache: { key: string; value: (Eye & { index: WallIndex })[] | null } = {
        key: "",
        value: null,
    };
    const carried_cache: { key: string; value: Lamp[] | null } = { key: "", value: null };
    /** Which index was used, as text for the caches */
    const index_ids = new WeakMap<WallIndex, number>();
    let next_index_id = 0;
    function index_id(index: WallIndex | null) {
        if (!index) return -1;
        if (!index_ids.has(index)) index_ids.set(index, next_index_id++);
        return index_ids.get(index)!;
    }

    /** The middle of a marker where it is going, in cells */
    function marker_center(marker: any): Point {
        return [
            marker.x.target * grid_columns + marker.size / 2,
            marker.y.target * map_rows + marker.size / 2,
        ];
    }

    /** Where the viewer's figures look from, what they see and how far in the dark */
    let eyes: (Eye & { index: WallIndex })[] = $derived.by(() => {
        if (!wall_index || !viewer) return [];
        const character = gameState.characters.find(
            (char) => char.player_name === viewer,
        );
        const seeing: { point: Point; feet: number; index: WallIndex }[] = markers
            .filter((marker: any) => marker.name === character?.name)
            .map((marker: any): { point: Point; feet: number; index: WallIndex } => {
                const point = marker_center(marker);
                const feet =
                    marker.darkvision ??
                    (character?.specialSenses as { darkvision?: number })
                        ?.darkvision ??
                    0;
                // A figure standing in fog itself would see nothing at all
                const in_fog = isFogAt(
                    fog_squares,
                    Math.floor(point[0] - grid_x_offset / size),
                    Math.floor(point[1] - grid_y_offset / size),
                );
                return { point, feet, index: in_fog ? wall_index! : sight_index! };
            });
        const key = JSON.stringify(
            seeing.map(({ point, feet, index }) => [point, feet, index_id(index)]),
        );
        return same(eyes_cache, key, () =>
            seeing.map(({ point, feet, index }) => ({
                point,
                polygon: visibility_polygon(index, point),
                darkvision: feet / 5,
                index,
            })),
        );
    });
    /** The lights on the map, what they reach only changes with the walls and doors */
    let placed_lamps: Lamp[] = $derived(
        wall_index
            ? lights
                  .filter((light) => light.on !== false)
                  .map((light) => {
                      const point: Point = [light.x * grid_columns, light.y * map_rows];
                      return {
                          point,
                          polygon: visibility_polygon(
                              wall_index!,
                              point,
                              light.dim / 5,
                          ),
                          bright: light.bright / 5,
                          dim: light.dim / 5,
                          color: light.color,
                      };
                  })
            : [],
    );
    /** Torches and the like the figures carry, everyone sees their light */
    let carried_lamps: Lamp[] = $derived.by(() => {
        if (!wall_index) return [];
        const carrying: Omit<Lamp, "polygon">[] = markers
            .filter((marker: any) => marker.light?.dim > 0 && !marker.hidden)
            .map((marker: any): Omit<Lamp, "polygon"> => ({
                point: marker_center(marker),
                bright: marker.light.bright / 5,
                dim: marker.light.dim / 5,
                color: marker.light.color ?? preset_of(marker.light)?.color,
            }));
        const key = JSON.stringify([carrying, index_id(wall_index)]);
        return same(carried_cache, key, () =>
            carrying.map((lamp) => ({
                ...lamp,
                polygon: visibility_polygon(wall_index!, lamp.point, lamp.dim),
            })),
        );
    });
    /** The scene's light and its placed lights, only new when they or the walls change */
    let base = $derived(
        wall_index && map_rows
            ? light_base(grid_columns, map_rows, lighting, placed_lamps)
            : null,
    );
    /** How well the viewer sees every spot, with the lights and darkvision */
    let sight: Sight | null = $derived(
        base && viewer
            ? compute_sight(base, grid_columns, map_rows, carried_lamps, eyes)
            : null,
    );

    /** The DM sees everything, the coloured glow of the lights too */
    let dm_tint = $derived(
        gameState.dm && !viewer && base
            ? compute_tint(base, grid_columns, map_rows, carried_lamps)
            : null,
    );

    function seen(point: Point) {
        return !!sight && seen_at(sight, point) > SEEN;
    }

    /**
     * How unclear a figure in the dark is: at the edge of what a light reaches or of the
     * viewer's darkvision. 0 further inside, growing over the last 5 ft to 1 at the edge.
     */
    function dim_edge(marker: any) {
        // A lit scene shows everything clearly
        if (!sight || !wall_index || lighting !== "dark") return 0;
        const center: Point = [
            marker.x.current * columns + marker.size / 2,
            marker.y.current * map_rows + marker.size / 2,
        ];
        // How many cells inside the best light or darkvision it stands
        let inside = -Infinity;
        for (const lamp of [...placed_lamps, ...carried_lamps]) {
            const distance = Math.hypot(
                center[0] - lamp.point[0],
                center[1] - lamp.point[1],
            );
            if (distance - lamp.dim > 1 || !wall_index.sees(lamp.point, center)) continue;
            inside = Math.max(inside, lamp.dim - distance);
        }
        for (const eye of eyes) {
            if (eye.darkvision <= 0 || !eye.index.sees(eye.point, center)) continue;
            const distance = Math.hypot(
                center[0] - eye.point[0],
                center[1] - eye.point[1],
            );
            inside = Math.max(inside, eye.darkvision - distance);
        }
        return Math.min(1, Math.max(0, 1 - inside));
    }

    /** Monsters and others out of the viewer's sight are hidden, the party always shows */
    function out_of_sight(marker: any) {
        if (!wall_index || !viewer) return false;
        const x = marker.x.current * columns;
        const y = marker.y.current * map_rows;
        const s = marker.size;
        // The middle or near a corner, a big monster shows once a part of it does
        const inset = Math.min(0.25, s / 4);
        return ![
            [x + s / 2, y + s / 2],
            [x + inset, y + inset],
            [x + s - inset, y + inset],
            [x + inset, y + s - inset],
            [x + s - inset, y + s - inset],
        ].some((point) => seen(point as Point));
    }

    let door_size = $derived(Math.max(14, size * 0.45));

    function door_middle(door: Door): Point {
        return [(door.a[0] + door.b[0]) / 2, (door.a[1] + door.b[1]) / 2];
    }

    /** Players see the doors of what they explored, the DM all unless looking as one */
    function door_shown(door: Door) {
        if (gameState.dm && !viewer) return true;
        const [x, y] = door_middle(door);
        return !isFogAt(
            fog_squares,
            Math.floor((x * w - x_offset) / size),
            Math.floor((y * h - y_offset) / size),
        );
    }

    function use_door(door: Door) {
        if (
            gameState.dm &&
            appState.selectedTool === Tools.Walls &&
            wallState.mode === "erase"
        ) {
            remove_door(door);
            return;
        }
        if (door.locked && !gameState.dm) {
            notify("Die Tür ist abgeschlossen", MessageTypes.Info, 2000);
            return;
        }
        door.open = !door.open;
        appState.ws?.send(SetDoor.create(door.id, { open: door.open }));
    }

    function lock_door(door: Door) {
        if (!gameState.dm) return;
        door.locked = !door.locked;
        appState.ws?.send(SetDoor.create(door.id, { locked: door.locked }));
    }

    // The DM's wall tool: points of the wall being drawn and of a door being dragged
    let wall_draft: Point[] = $state([]);
    let wall_cursor: Point | null = $state(null);
    let door_start: Point | null = $state(null);
    /** A finger adds a point when it lets go without moving, two fingers pinch */
    let wall_tap: PointerEvent | null = null;

    $effect(() => {
        if (appState.selectedTool !== Tools.Walls) {
            wall_draft = [];
            wall_cursor = null;
            door_start = null;
        }
    });

    function short_id() {
        return Math.random().toString(36).slice(2, 10);
    }

    const save_walls = debounce(() => {
        if (!gameState.scene) return;
        appState.ws?.send(
            PutWalls.create(
                gameState.scene.name,
                $state.snapshot(walls),
                $state.snapshot(doors),
                { lights: $state.snapshot(lights) },
            ),
        );
    }, 300);

    /** The light at this point, within reach of a click */
    function light_at(px: number, py: number) {
        const reach = 14 / gesture_scale;
        return lights.find(
            (light) => Math.hypot(light.x * w - px, light.y * h - py) <= reach,
        );
    }

    /** The light whose colour and size the DM is changing */
    let editing_light: string | null = $state(null);
    let edited_light = $derived(
        lights.find((light) => light.id === editing_light) ?? null,
    );

    $effect(() => {
        if (appState.selectedTool !== Tools.Walls || wallState.mode !== "light") {
            editing_light = null;
        }
    });

    function edit_light(id: string, change: Partial<SceneLight>, record = true) {
        if (!gameState.scene) return;
        if (record) record_undo();
        gameState.scene.state.lights = lights.map((light) =>
            light.id === id ? { ...light, ...change } : light,
        );
        save_walls();
    }

    /** A click puts a light there, or opens the one there to change it */
    function place_light(px: number, py: number) {
        if (!gameState.scene) return;
        const near = light_at(px, py);
        if (near) {
            editing_light = near.id;
            return;
        }
        // The first click next to an open one closes it
        if (editing_light) {
            editing_light = null;
            return;
        }
        record_undo();
        {
            const preset =
                LIGHT_PRESETS.find((preset) => preset.key === wallState.light) ??
                LIGHT_PRESETS[1];
            const [x, y] = wall_snap(px, py);
            gameState.scene.state.lights = [
                ...lights,
                {
                    id: short_id(),
                    x,
                    y,
                    bright: preset.bright,
                    dim: preset.dim,
                    color: preset.color,
                    on: true,
                },
            ];
        }
        save_walls();
    }

    /**
     * Where a click puts a point: on the end of another wall nearby, so no light slips
     * through a gap, with snapping on a corner of the grid. In fractions of the map.
     */
    function wall_snap(px: number, py: number): Point {
        let best: Point | null = null;
        let best_distance = 12 / gesture_scale;
        const consider = (point: Point) => {
            const distance = Math.hypot(point[0] * w - px, point[1] * h - py);
            if (distance < best_distance) {
                best_distance = distance;
                best = point;
            }
        };
        for (const wall of walls) wall.points.forEach(consider);
        for (const door of doors) {
            consider(door.a);
            consider(door.b);
        }
        wall_draft.forEach(consider);
        if (best) return [best[0], best[1]];
        if (snapping) {
            return [
                (Math.round((px - x_offset) / size) * size + x_offset) / w,
                (Math.round((py - y_offset) / size) * size + y_offset) / h,
            ];
        }
        return [px / w, py / h];
    }

    function finish_wall() {
        if (wall_draft.length >= 2 && gameState.scene) {
            record_undo();
            gameState.scene.state.walls = [
                ...walls,
                { id: short_id(), points: $state.snapshot(wall_draft) },
            ];
            save_walls();
        }
        wall_draft = [];
    }

    function finish_door() {
        if (door_start && wall_cursor && gameState.scene) {
            const length = Math.hypot(
                (wall_cursor[0] - door_start[0]) * w,
                (wall_cursor[1] - door_start[1]) * h,
            );
            if (length >= size * 0.3) {
                record_undo();
                gameState.scene.state.doors = [
                    ...doors,
                    {
                        id: short_id(),
                        a: $state.snapshot(door_start),
                        b: $state.snapshot(wall_cursor),
                        open: false,
                        locked: false,
                    },
                ];
                save_walls();
            }
        }
        door_start = null;
    }

    function wall_down(event: PointerEvent) {
        if (event.button !== 0 || !gameState.scene) return;
        const { x: px, y: py } = local(event);
        if (wallState.mode === "erase") {
            erase_wall_at(px, py);
            return;
        }
        if (wallState.mode === "light") {
            place_light(px, py);
            return;
        }
        const point = wall_snap(px, py);
        if (wallState.mode === "door") {
            door_start = point;
            wall_cursor = point;
            on_release(finish_door);
            return;
        }
        // The same point again, e.g. a double click, ends the wall. Its first one closes it.
        const last = wall_draft[wall_draft.length - 1];
        if (last && last[0] === point[0] && last[1] === point[1]) {
            finish_wall();
            return;
        }
        wall_draft = [...wall_draft, point];
        const first = wall_draft[0];
        if (wall_draft.length > 2 && first[0] === point[0] && first[1] === point[1]) {
            finish_wall();
        }
    }

    function wall_move(event: PointerEvent) {
        const { x: px, y: py } = local(event);
        wall_cursor =
            wallState.mode === "erase" || wallState.mode === "light"
                ? null
                : wall_snap(px, py);
    }

    /** How far a point is from a line, in pixels of the map */
    function distance_to_line(px: number, py: number, a: Point, b: Point) {
        const ax = a[0] * w;
        const ay = a[1] * h;
        const dx = b[0] * w - ax;
        const dy = b[1] * h - ay;
        const length = dx * dx + dy * dy;
        const t =
            length === 0
                ? 0
                : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    function remove_door(door: Door) {
        if (!gameState.scene) return;
        record_undo();
        gameState.scene.state.doors = doors.filter((other) => other.id !== door.id);
        save_walls();
    }

    /** Removes the door or the piece of wall at this point, a wall splits in two there */
    function erase_wall_at(px: number, py: number) {
        if (!gameState.scene) return;
        const reach = 10 / gesture_scale;
        const light = light_at(px, py);
        if (light) {
            record_undo();
            gameState.scene.state.lights = lights.filter((other) => other !== light);
            save_walls();
            return;
        }
        const door = doors.find(
            (door) => distance_to_line(px, py, door.a, door.b) <= reach,
        );
        if (door) {
            remove_door(door);
            return;
        }
        for (const wall of walls) {
            for (let i = 1; i < wall.points.length; i++) {
                if (
                    distance_to_line(px, py, wall.points[i - 1], wall.points[i]) >
                    reach
                ) {
                    continue;
                }
                record_undo();
                const parts = [wall.points.slice(0, i), wall.points.slice(i)]
                    .filter((points) => points.length >= 2)
                    .map((points, part) => ({
                        id: part === 0 ? wall.id : short_id(),
                        points: $state.snapshot(points),
                    }));
                gameState.scene.state.walls = walls.flatMap((other) =>
                    other === wall ? parts : [other],
                );
                save_walls();
                return;
            }
        }
    }

    function wall_keys(event: KeyboardEvent) {
        if (appState.selectedTool !== Tools.Walls) return;
        if (event.key === "Enter") finish_wall();
        if (event.key === "Escape") {
            wall_draft = [];
            door_start = null;
        }
    }

    function on_drop(
        payload: DragPayload,
        event: PointerEvent,
        map_element: HTMLElement,
    ) {
        if (payload.kind === "scene") {
            activate_scene(payload.scene.name);
            return;
        }

        // Everything in screen pixels, i.e. already scaled by the zoom
        const rect = map_element.getBoundingClientRect();
        const marker_px =
            (payload.marker.size / columns) * window.innerWidth * appState.zoom;
        // Center the marker on the cursor, like the drag preview
        let left = event.clientX - rect.left - marker_px / 2;
        let top = event.clientY - rect.top - marker_px / 2;

        if (event.ctrlKey) {
            const cell = rect.width / columns;
            const scale = rect.width / w;
            left =
                Math.round((left - x_offset * scale) / cell) * cell +
                x_offset * scale;
            top =
                Math.round((top - y_offset * scale) / cell) * cell +
                y_offset * scale;
        }

        left = Math.min(Math.max(left, 0), rect.width - marker_px);
        top = Math.min(Math.max(top, 0), rect.height - marker_px);
        const x = left / rect.width;
        const y = top / rect.height;

        // A character only has one marker: move it there instead of adding "Name 2"
        const character_marker = gameState.characters.some(
            (character) => character.name === payload.marker.name,
        )
            ? gameState.scene?.state.markers.find(
                  (marker) => marker.name === payload.marker.name,
              )
            : undefined;
        if (character_marker) {
            record_undo();
            character_marker.x.set(x);
            character_marker.y.set(y);
            // Saves the position and moves it for everyone else
            appState.ws?.send(MarkerFreed.create(character_marker.name, x, y));
            return;
        }

        add_marker(payload.marker, x, y);
    }
</script>

<svelte:window
    bind:innerWidth={window_w}
    bind:innerHeight={window_h}
    onkeydown={wall_keys}
/>

{#if keep_page}
    <div
        class="absolute top-0 left-0 invisible pointer-events-none"
        style="width: {keep_page.width}px; height: {keep_page.height}px"
        aria-hidden="true"
    ></div>
{/if}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Marker menus may reach past the edges of the map, they only keep on the screen: a
     narrow map leaves room beside it, on a tablet the window is taller than the map. What
     sticks out sideways past the screen or a wider map, like the stars of a marker at the
     edge, is cut off there, it would make the page scroll sideways. -->
<div
    class={editable ? "overflow-x-clip" : ""}
    style="width: {Math.max(1, layout_zoom) * 100}%"
>
<!-- With the selection tool a finger draws a box instead of panning. -->
<div
    class="relative select-none {editable
        ? ''
        : 'overflow-hidden'} {appState.selectedTool === Tools.Select
        ? 'touch-none'
        : ''} {gesture_scale !== 1 ? 'zooming' : ''}"
    bind:this={map_element}
    use:dropTarget={editable && gameState.dm
        ? { name: "map", accepts: ["marker", "scene"], onDrop: on_drop }
        : null}
    onpointerdown={start_pan}
    ondragstart={(event) => event.preventDefault()}
    onpointermove={pan}
    onpointerup={end_pan}
    onpointercancel={end_pan}
    style="width: {(layout_zoom / Math.max(1, layout_zoom)) *
        100}%; transform-origin: 0 0; transform: {editable
        ? `translate(${zoom_offset_x + shift_x}px, ${zoom_offset_y + shift_y}px) scale(${gesture_scale})`
        : 'none'}"
>
    <!-- The ambient light behind the map finds it by data-map. Decoded aside: a map of
         8192 pixels takes a few hundred milliseconds, which held up every animation -->
    <Display
        asset={file}
        thumbnail={!editable}
        alt="Map"
        data-map={editable ? "main" : undefined}
        decoding="async"
        class="w-full"
        fetchpriority={editable ? "high" : "auto"}
        draggable="false"
    />
    <div
        class="absolute top-0 left-0 w-full h-full pointer-events-none"
        bind:clientWidth={w}
        bind:clientHeight={h}
    ></div>
    <!-- The grid, one screen pixel wide at any zoom and sharp on high-DPI screens. Lines
         repeated by gradients, which the graphics card draws: as an SVG path over the whole
         map, Firefox drew it anew on the processor at every step of a zoom gesture, which
         alone cost a dozen frames of 50 ms per pinch. -->
    {#if size > 0}
        {@const line = 1 / gesture_scale}
        <div
            class="absolute top-0 left-0 w-full h-full z-0 overflow-hidden pointer-events-none"
            aria-hidden="true"
        >
            {#if columns > 1}
                <div
                    class="absolute"
                    style="left: {x_offset + size - line / 2}px; top: {y_offset}px; width: {(columns - 2) * size + line}px; height: {(rows - 1) * size}px; background: linear-gradient(to right, rgb(0 0 0 / 0.5) {line}px, transparent {line}px) 0 0 / {size}px 100% repeat-x"
                ></div>
            {/if}
            {#if rows > 2}
                <div
                    class="absolute"
                    style="left: {x_offset}px; top: {y_offset + size - line / 2}px; width: {w}px; height: {(rows - 3) * size + line}px; background: linear-gradient(to bottom, rgb(0 0 0 / 0.5) {line}px, transparent {line}px) 0 0 / 100% {size}px repeat-y"
                ></div>
            {/if}
        </div>
    {/if}
    {#if editable}
        <!-- Effects canvas -->
        <canvas
            bind:this={confetti_canvas}
            width={Math.round(base_w)}
            height={Math.round(base_h)}
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        ></canvas>
        <!-- Non Player Markers under the fog. No stacking of their own: the marker with its
             menu open rises above the fog and everything else, the others stay below. -->
        <div
            class="absolute top-0 left-0 w-full h-full pointer-events-none"
        >
            {#each non_player_markers as marker}
                {@const hidden = !gameState.dm && in_fog(marker)}
                <!-- Looking as a player, the DM doesn't see what they don't get -->
                {#if !out_of_sight(marker) && !(viewer && gameState.dm && marker.hidden)}
                {@const unclear = dim_edge(marker)}
                <Marker
                    {marker}
                    blur={unclear * (marker.size / columns) * w * 0.04}
                    fade={unclear * 0.4}
                    dragOptions={{
                        ...dragOptions,
                        position: {
                            x: marker.x.current * w,
                            y: marker.y.current * h,
                        },
                        disabled:
                            hidden || !!gameState.lockedMarkers[marker.name],
                    }}
                    columnCount={columns}
                    interactive={!hidden}
                />
                {/if}
            {/each}
        </div>
        <!-- Drawings and spell areas, under the fog like everything else -->
        <svg
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
            viewBox="0 0 {w || 1} {h || 1}"
        >
            {#each shown_drawings as item (item.id)}
                {@const { shape, label } = drawing_shape(item, w, h, size)}
                {#if shape.type === "polyline"}
                    <polyline
                        points={shape.points
                            .map((point) => point.join(","))
                            .join(" ")}
                        fill="none"
                        stroke={item.color}
                        stroke-width={Math.max(2, size * 0.08)}
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                {:else if shape.type === "circle"}
                    <circle
                        cx={shape.cx}
                        cy={shape.cy}
                        r={shape.r}
                        fill={item.color}
                        fill-opacity="0.25"
                        stroke={item.color}
                        stroke-width={Math.max(2, size * 0.05)}
                    />
                {:else}
                    <polygon
                        points={shape.points
                            .map((point) => point.join(","))
                            .join(" ")}
                        fill={item.color}
                        fill-opacity="0.25"
                        stroke={item.color}
                        stroke-width={Math.max(2, size * 0.05)}
                        stroke-linejoin="round"
                    />
                {/if}
                {#if label}
                    {@const font = size * 0.28}
                    {@const width = label.text.length * font * 0.6 + font}
                    <rect
                        x={label.x - width / 2}
                        y={label.y - font * 0.75}
                        {width}
                        height={font * 1.5}
                        rx={font * 0.75}
                        fill="rgb(0 0 0 / 0.6)"
                    />
                    <text
                        x={label.x}
                        y={label.y}
                        text-anchor="middle"
                        dominant-baseline="central"
                        font-size={font}
                        font-weight="bold"
                        fill="white">{label.text}</text
                    >
                {/if}
            {/each}
        </svg>
        {#if sight}
            <!-- What the figures don't see is darker, under the fog the DM lays -->
            <VisionLayer
                width={sight.width}
                height={sight.height}
                shade={sight.shade}
                grey={sight.grey}
                tint={sight.tint}
            />
        {:else if dm_tint}
            <VisionLayer
                width={dm_tint.width}
                height={dm_tint.height}
                tint={dm_tint.tint}
            />
        {/if}
        <!-- Fog -->
        <canvas
            bind:this={fogCanvas}
            width={Math.round(w * fog_resolution)}
            height={Math.round(h * fog_resolution)}
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
            style="opacity: {gameState.dm && !viewer ? '60' : '100'}%"
        >
        </canvas>
        <!-- Uncovered fog dissolving -->
        <div
            bind:this={fog_fades}
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
            style="opacity: {gameState.dm && !viewer ? '60' : '100'}%"
        ></div>
        <!-- Player Markers above the Fog, a marker with its menu open above everything -->
        <div
            class="absolute top-0 left-0 w-full h-full z-0 has-[.menu-open]:z-30 pointer-events-none"
        >
            {#each player_markers as marker}
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
        {#if gameState.dm && appState.selectedTool === Tools.Walls}
            <!-- The walls only show while the DM edits them, as wide on the screen at any zoom -->
            <svg
                class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
                viewBox="0 0 {w || 1} {h || 1}"
                aria-hidden="true"
            >
                {#each walls as wall (wall.id)}
                    <polyline
                        points={wall.points
                            .map(([x, y]) => `${x * w},${y * h}`)
                            .join(" ")}
                        fill="none"
                        stroke="#22d3ee"
                        stroke-width={3 / gesture_scale}
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                {/each}
                {#each doors as door (door.id)}
                    <line
                        x1={door.a[0] * w}
                        y1={door.a[1] * h}
                        x2={door.b[0] * w}
                        y2={door.b[1] * h}
                        stroke={door.locked ? "#ef4444" : "#f59e0b"}
                        stroke-width={5 / gesture_scale}
                        stroke-linecap="round"
                        stroke-dasharray={door.open
                            ? `${6 / gesture_scale} ${6 / gesture_scale}`
                            : undefined}
                    />
                {/each}
                {#if wall_draft.length}
                    <polyline
                        points={[
                            ...wall_draft,
                            ...(wall_cursor ? [wall_cursor] : []),
                        ]
                            .map(([x, y]) => `${x * w},${y * h}`)
                            .join(" ")}
                        fill="none"
                        stroke="white"
                        stroke-width={3 / gesture_scale}
                        stroke-dasharray="{8 / gesture_scale} {5 / gesture_scale}"
                    />
                {/if}
                {#if door_start && wall_cursor}
                    <line
                        x1={door_start[0] * w}
                        y1={door_start[1] * h}
                        x2={wall_cursor[0] * w}
                        y2={wall_cursor[1] * h}
                        stroke="#f59e0b"
                        stroke-width={5 / gesture_scale}
                        stroke-dasharray="{8 / gesture_scale} {5 / gesture_scale}"
                    />
                {/if}
                <!-- What the lights reach as two areas, dim and bright: twenty candles
                     on one spot don't stack into a bright yellow or a heap of rings -->
                {#each ["dim", "bright"] as const as reach (reach)}
                    <path
                        d={lights
                            .filter((light) => light.on !== false)
                            .map((light) => {
                                const r = (light[reach] / 5) * (w / columns);
                                return `M${light.x * w - r} ${light.y * h}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
                            })
                            .join("")}
                        fill="rgb(253 224 71 / {reach === 'dim' ? 0.08 : 0.12})"
                    />
                {/each}
                {#if edited_light}
                    <!-- The outline of the light being changed -->
                    {#each [edited_light.dim, edited_light.bright] as radius, i (i)}
                        <circle
                            cx={edited_light.x * w}
                            cy={edited_light.y * h}
                            r={(radius / 5) * (w / columns)}
                            fill="none"
                            stroke="#fde047"
                            stroke-width={1.5 / gesture_scale}
                            stroke-dasharray={i === 0
                                ? `${6 / gesture_scale} ${4 / gesture_scale}`
                                : undefined}
                        />
                    {/each}
                {/if}
                {#each lights as light (light.id)}
                    <circle
                        cx={light.x * w}
                        cy={light.y * h}
                        r={7 / gesture_scale}
                        fill={light.on === false
                            ? "#78716c"
                            : (light.color ?? "#facc15")}
                        stroke={light.id === editing_light ? "white" : "black"}
                        stroke-width={1.5 / gesture_scale}
                    />
                {/each}
                {#if wall_cursor && wallState.mode !== "erase"}
                    <circle
                        cx={wall_cursor[0] * w}
                        cy={wall_cursor[1] * h}
                        r={5 / gesture_scale}
                        fill="white"
                    />
                {/if}
            </svg>
        {/if}
        {#if edited_light && gameState.dm}
            <!-- Above the layer that catches clicks for the tool, as wide at any zoom -->
            <div
                class="absolute z-20 bg-base-100 rounded-box shadow-lg p-2 flex flex-col gap-2 text-sm w-56"
                style="left: {edited_light.x * w}px; top: {edited_light.y *
                    h}px; transform-origin: left center; transform: translate({14 /
                    gesture_scale}px, -50%) scale({1 / gesture_scale})"
                role="dialog"
                aria-label="Licht"
                tabindex="-1"
                onpointerdown={(event) => event.stopPropagation()}
            >
                <div class="flex items-center gap-2">
                    <input
                        type="color"
                        class="w-9 h-8 shrink-0 cursor-pointer rounded bg-transparent"
                        aria-label="Farbe des Lichts"
                        value={edited_light.color ?? "#ffffff"}
                        onpointerdown={record_undo}
                        oninput={(event) =>
                            edit_light(
                                edited_light!.id,
                                { color: event.currentTarget.value },
                                false,
                            )}
                    />
                    <select
                        class="select select-sm flex-1 min-w-0"
                        aria-label="Wie weit das Licht reicht"
                        value={preset_of(edited_light)?.key ?? "custom"}
                        onchange={(event) => {
                            const preset = LIGHT_PRESETS.find(
                                (preset) => preset.key === event.currentTarget.value,
                            );
                            if (preset) {
                                edit_light(edited_light!.id, {
                                    bright: preset.bright,
                                    dim: preset.dim,
                                });
                            }
                        }}
                    >
                        {#each LIGHT_PRESETS as preset (preset.key)}
                            <option value={preset.key}
                                >{preset.label} ({preset.bright}/{preset.dim} ft)</option
                            >
                        {/each}
                        {#if !preset_of(edited_light)}
                            <option value="custom"
                                >{edited_light.bright}/{edited_light.dim} ft</option
                            >
                        {/if}
                    </select>
                </div>
                <div class="flex gap-1">
                    <button
                        class="btn btn-sm flex-1"
                        onclick={() =>
                            edit_light(edited_light!.id, {
                                on: edited_light!.on === false,
                            })}
                    >
                        <i
                            class="fa-solid {edited_light.on === false
                                ? 'fa-lightbulb'
                                : 'fa-power-off'}"
                        ></i>
                        {edited_light.on === false ? "Anmachen" : "Ausmachen"}
                    </button>
                    <button
                        class="btn btn-sm btn-soft btn-error"
                        aria-label="Licht löschen"
                        onclick={() => {
                            if (!gameState.scene) return;
                            record_undo();
                            const id = edited_light!.id;
                            editing_light = null;
                            gameState.scene.state.lights = lights.filter(
                                (light) => light.id !== id,
                            );
                            save_walls();
                        }}><i class="fa-solid fa-trash"></i></button
                    >
                    <button
                        class="btn btn-sm btn-ghost btn-square"
                        aria-label="Schließen"
                        onclick={() => (editing_light = null)}
                        ><i class="fa-solid fa-xmark"></i></button
                    >
                </div>
            </div>
        {/if}
        {#if vision_on || (gameState.dm && appState.selectedTool === Tools.Walls)}
            <!-- Everyone opens and closes the doors, the DM locks them with a right click -->
            {#each doors as door (door.id)}
                {#if door_shown(door)}
                    {@const [mx, my] = door_middle(door)}
                    <button
                        class="door absolute rounded-full shadow flex items-center justify-center {door.locked
                            ? 'bg-error text-error-content'
                            : door.open
                              ? 'bg-base-100/70 text-base-content'
                              : 'bg-warning text-warning-content'}"
                        style="left: {mx * w}px; top: {my * h}px; width: {door_size}px; height: {door_size}px; font-size: {door_size *
                            0.5}px; translate: -50% -50%"
                        title={door.locked
                            ? "Abgeschlossen"
                            : door.open
                              ? "Tür schließen"
                              : "Tür öffnen"}
                        aria-label={door.locked
                            ? "Abgeschlossene Tür"
                            : door.open
                              ? "Tür schließen"
                              : "Tür öffnen"}
                        onpointerdown={(event) => event.stopPropagation()}
                        onclick={() => use_door(door)}
                        oncontextmenu={(event) => {
                            event.preventDefault();
                            lock_door(door);
                        }}
                    >
                        <i
                            class="fa-solid {door.locked
                                ? 'fa-lock'
                                : door.open
                                  ? 'fa-door-open'
                                  : 'fa-door-closed'}"
                        ></i>
                    </button>
                {/if}
            {/each}
        {/if}
        {#if fog_rect}
            <!-- Borders as wide on the screen at any zoom -->
            <div
                class="absolute border-dashed pointer-events-none {appState.selectedTool ===
                Tools.AddFog
                    ? 'border-base-content bg-base-content/30'
                    : 'border-info bg-info/10'}"
                style="border-width: {2 / gesture_scale}px; left: {Math.min(
                    fog_rect.x1,
                    fog_rect.x2,
                ) *
                    size +
                    x_offset}px; top: {Math.min(fog_rect.y1, fog_rect.y2) *
                    size +
                    y_offset}px; width: {(Math.abs(fog_rect.x2 - fog_rect.x1) +
                    1) *
                    size}px; height: {(Math.abs(fog_rect.y2 - fog_rect.y1) + 1) *
                    size}px;"
            ></div>
        {/if}
        {#if box}
            <div
                class="absolute border-info bg-info/10 pointer-events-none"
                style="border-width: {2 / gesture_scale}px; left: {Math.min(
                    box.x1,
                    box.x2,
                ) *
                    100}%; top: {Math.min(box.y1, box.y2) *
                    100}%; width: {Math.abs(box.x2 - box.x1) *
                    100}%; height: {Math.abs(box.y2 - box.y1) * 100}%;"
            ></div>
        {/if}
        {#each Object.entries(pointers) as [name, pointer] (name)}
            {#if pointer.visible && !pointer_in_fog(pointer)}
                <div
                    transition:fade
                    class="absolute pointer-events-none top-0 left-0 origin-top-left"
                    style="transform: translate({pointer.x.current *
                        w}px, {pointer.y.current * h}px) scale({pointer.large
                        ? '2'
                        : '1'});"
                >
                    <i class="fa-solid fa-arrow-pointer"></i>
                    <span
                        class="badge badge-xs {pointer_is_dm(name)
                            ? ''
                            : 'badge-accent'}">{name || gameState.DMName}</span
                    >
                </div>
            {/if}
        {/each}
        {#if appState.selectedTool === Tools.Ruler && ((ruler_size || 0) / size) * 5 > 0.5}
            <!-- The same size on the screen at any zoom, zoomed in it would cover the map -->
            <div
                role="banner"
                class="absolute origin-left pointer-events-none"
                style="top: {(ruler_origin.y || 0) * size +
                    y_offset}px; left: {(ruler_origin.x || 0) * size +
                    x_offset}px;"
            >
                <div
                    class="origin-left block bg-base-100 text-base-content rounded-full shadow-sm"
                    style="width: {ruler_size}px; height: {0.5 /
                        gesture_scale}rem; translate: 0 -50%; transform: rotate({((ruler_angle ||
                        0) /
                        (2 * Math.PI)) *
                        360}deg);"
                >
                    <span
                        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex justify-center items-center whitespace-nowrap px-2 py-1 rounded-box bg-base-100 shadow-sm {(ruler_angle ||
                            0) >
                            Math.PI / 2 || (ruler_angle || 0) < -Math.PI / 2
                            ? 'rotate-180'
                            : ''}"
                        style="scale: {1 / gesture_scale}"
                    >
                        {ruler_size
                            ? ((ruler_size / size) * 5).toFixed(1)
                            : "Unbekannt"}
                        <i class="ml-2 fa-solid fa-shoe-prints text-xs"></i>
                    </span>
                </div>
            </div>
        {/if}
    {/if}
    {#if appState.selectedTool === Tools.Pointer || appState.selectedTool === Tools.AddFog || appState.selectedTool === Tools.RemoveFog || appState.selectedTool === Tools.Ruler || appState.selectedTool === Tools.Draw || appState.selectedTool === Tools.Walls}
        <!-- A finger uses the tool instead of panning, two fingers still pinch and pan -->
        <button
            aria-label="Click Capture Layer"
            class="absolute inset-0 touch-none {appState.selectedTool ===
                Tools.Draw || appState.selectedTool === Tools.Walls
                ? 'cursor-crosshair'
                : ''}"
            style="-webkit-touch-callout: none"
            onpointermove={tool_move}
            onpointerdown={(evt) => {
                last_pointer = evt.pointerType;
                tool_down(evt);
            }}
            onpointerup={tool_up}
            onpointercancel={tool_up}
            oncontextmenu={(evt) => {
                if (editable && appState.selectedTool === Tools.Draw) {
                    evt.preventDefault();
                    const point = local(evt);
                    delete_drawing_at(point.x, point.y);
                }
                // A right click ends the wall being drawn
                if (editable && appState.selectedTool === Tools.Walls) {
                    evt.preventDefault();
                    finish_wall();
                }
            }}
            onclick={(evt) => {
                if (!editable) return;
                if (
                    evt.button === 0 &&
                    appState.selectedTool === Tools.Pointer
                ) {
                    if (!appState.ws) return;
                    appState.ws.send(MouseLarge.create());
                } else if (
                    evt.button === 0 &&
                    appState.selectedTool === Tools.Ruler &&
                    last_pointer === "mouse"
                ) {
                    const point = local(evt);
                    ruler_origin = {
                        x: (point.x - x_offset) / size,
                        y: (point.y - y_offset) / size,
                    };
                }
            }}
        ></button>
    {/if}
</div>
</div>
