<script lang="ts">
    import { onMount, tick } from "svelte";
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
    } from "$lib/types/messaging/client_messages";
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

    // Lines instead of a canvas, they stay sharp when zoomed and on high-DPI screens
    let grid_path = $derived.by(() => {
        if (!size || !rows) return "";
        let path = "";
        for (let i = 1; i < columns; i++) {
            path += `M${size * i + x_offset} ${y_offset}V${(rows - 1) * size + y_offset}`;
        }
        for (let i = 1; i < rows - 1; i++) {
            path += `M${x_offset} ${size * i + y_offset}H${w + x_offset}`;
        }
        return path;
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

    $effect(() => {
        if (!editable) return;

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

            // The blur is left out while painting. The tool goes first: reading
            // mouseDown would redraw the fog on every click anywhere.
            const painting =
                (appState.selectedTool === Tools.AddFog ||
                    appState.selectedTool === Tools.RemoveFog) &&
                appState.mouseDown;
            if (fogPattern && !painting) {
                fogCtx.globalCompositeOperation = "source-in";
                // The texture grows with the map, like at the zoom it was made for
                fogPattern.setTransform(new DOMMatrix().scale(layout_zoom));
                fogCtx.fillStyle = fogPattern;
                // The blur works in pixels of the canvas, not of the map
                fogCtx.filter = `blur(${5 * fog_resolution * layout_zoom}px)`;
                fogCtx.fillRect(-5, -5, w + 10, h + 10);
                fogCtx.filter = "none";
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
            if (moved) clearTimeout(long_press);
            if (waiting_fog) {
                if (!moved) return;
                const start = waiting_fog;
                waiting_fog = null;
                clickHandler(start, true);
            }
        }
        if (appState.selectedTool === Tools.Draw) continue_drawing(event);
        clickHandler(event, false);
    }

    function tool_up(event: PointerEvent) {
        clearTimeout(long_press);
        fingers.delete(event.pointerId);
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
    // shrinks towards its center.
    let zoom_offset_x = $derived(
        editable && appState.zoom < 1 ? (base_w * (1 - appState.zoom)) / 2 : 0,
    );
    let zoom_offset_y = $derived(
        editable && appState.zoom < 1 ? (base_h * (1 - appState.zoom)) / 2 : 0,
    );
    let map_element: HTMLDivElement | null = $state(null);

    $effect(() => {
        if (editable && w && h) appState.map_aspect = h / w;
    });

    const MIN_ZOOM = 0.3;
    const MAX_ZOOM = 5;

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
            unshifted.left +
            window.scrollX +
            (zoom < 1 ? (base_w * (1 + zoom)) / 2 : base_w * zoom);
        const bottom =
            unshifted.top +
            window.scrollY +
            (zoom < 1 ? (base_h * (1 + zoom)) / 2 : base_h * zoom);
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
        new_zoom = Math.min(Math.max(new_zoom, MIN_ZOOM), MAX_ZOOM);
        // The tolerance keeps rounding errors from stopping again right after a stop
        const titlebar = parseFloat(getComputedStyle(document.body).marginTop) || 30;
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
                MAX_ZOOM,
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

{#if keep_page}
    <div
        class="absolute top-0 left-0 invisible pointer-events-none"
        style="width: {keep_page.width}px; height: {keep_page.height}px"
        aria-hidden="true"
    ></div>
{/if}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- Marker menus may reach past the bottom of a wide map, on a tablet the window is
     taller than the map. With the selection tool a finger draws a box instead of panning. -->
<div
    class="relative select-none {editable
        ? 'overflow-x-clip'
        : 'overflow-hidden'} {appState.selectedTool === Tools.Select
        ? 'touch-none'
        : ''}"
    bind:this={map_element}
    use:dropTarget={editable && gameState.dm
        ? { name: "map", accepts: ["marker", "scene"], onDrop: on_drop }
        : null}
    onpointerdown={start_pan}
    onpointermove={pan}
    onpointerup={end_pan}
    onpointercancel={end_pan}
    style="width: {layout_zoom * 100}%; transform-origin: 0 0; transform: {editable
        ? `translate(${zoom_offset_x + shift_x}px, ${zoom_offset_y + shift_y}px) scale(${gesture_scale})`
        : 'none'}"
>
    <Display
        asset={file}
        thumbnail={!editable}
        alt="Map"
        class="w-full"
        fetchpriority={editable ? "high" : "auto"}
    />
    <div
        class="absolute top-0 left-0 w-full h-full pointer-events-none"
        bind:clientWidth={w}
        bind:clientHeight={h}
    ></div>
    <!-- One screen pixel wide at any zoom -->
    <svg
        class="absolute top-0 left-0 w-full h-full z-0 opacity-50 pointer-events-none"
        viewBox="0 0 {w || 1} {h || 1}"
        aria-hidden="true"
    >
        <path
            d={grid_path}
            fill="none"
            stroke="black"
            stroke-width={1 / gesture_scale}
        />
    </svg>
    {#if editable}
        <!-- Effects canvas -->
        <canvas
            bind:this={confetti_canvas}
            width={Math.round(base_w)}
            height={Math.round(base_h)}
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
        ></canvas>
        <!-- Non Player Markers under the fog, but their menu goes over it and the drawings -->
        <div
            class="absolute top-0 left-0 w-full h-full z-0 has-[:hover]:z-20 pointer-events-none"
        >
            {#each non_player_markers as marker}
                {@const hidden = !gameState.dm && in_fog(marker)}
                <Marker
                    {marker}
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
        <!-- Fog -->
        <canvas
            bind:this={fogCanvas}
            width={Math.round(w * fog_resolution)}
            height={Math.round(h * fog_resolution)}
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
            style="opacity: {gameState.dm ? '60' : '100'}%"
        >
        </canvas>
        <!-- Player Markers above the Fog -->
        <div
            class="absolute top-0 left-0 w-full h-full z-0 pointer-events-none"
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
    {#if appState.selectedTool === Tools.Pointer || appState.selectedTool === Tools.AddFog || appState.selectedTool === Tools.RemoveFog || appState.selectedTool === Tools.Ruler || appState.selectedTool === Tools.Draw}
        <!-- A finger uses the tool instead of panning, two fingers still pinch and pan -->
        <button
            aria-label="Click Capture Layer"
            class="absolute inset-0 touch-none {appState.selectedTool ===
            Tools.Draw
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
