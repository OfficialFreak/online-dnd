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
    import { invoke } from "@tauri-apps/api/core";
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
        set_rows(rows);
    });

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
            invoke("send_mouse_position", { x: x, y: y, name: gameState.name });
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
            !appState.dragging
        ) {
            throttled(currentMouseX, currentMouseY);
        }

        if (
            editable &&
            ruler_origin.x &&
            ruler_origin.y &&
            appState.selectedTool === Tools.Ruler
        ) {
            // Calculate Length of Ruler
            ruler_size =
                Math.sqrt(
                    ((event.offsetX - x_offset) / size - ruler_origin.x) ** 2 +
                        ((event.offsetY - y_offset) / size - ruler_origin.y) **
                            2,
                ) * size;
            // Calculate angle ruler should be at
            ruler_angle = Math.atan2(
                (event.offsetY - y_offset) / size - ruler_origin.y,
                (event.offsetX - x_offset) / size - ruler_origin.x,
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
     * Calls done when the mouse is released, also outside of the map. Not an effect on
     * appState.mouseDown: the body only sets it after the map's mousedown, and Svelte runs
     * effects in between, so it would end what just started.
     */
    function on_release(done: () => void) {
        window.addEventListener("mouseup", done, { once: true });
    }

    function start_drawing(event: MouseEvent) {
        if (event.button !== 0 || !editable) return;
        let px = event.offsetX;
        let py = event.offsetY;
        // Ctrl starts at a corner of the grid
        if (appState.ctrlPressed) {
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

    function continue_drawing(event: MouseEvent) {
        if (!drawing) return;
        const px = event.offsetX;
        const py = event.offsetY;
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
        const snap = appState.ctrlPressed;
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

    /** Right click deletes the drawing under the mouse, players can only delete theirs */
    function delete_drawing_at(event: MouseEvent) {
        event.preventDefault();
        const hit = drawings
            .toReversed()
            .find(
                (drawing) =>
                    (gameState.dm || drawing.owner === gameState.name) &&
                    shape_contains(
                        drawing_shape(drawing, w, h, size).shape,
                        event.offsetX,
                        event.offsetY,
                        Math.max(6, size * 0.2),
                    ),
            );
        if (hit) appState.ws?.send(DeleteDrawings.create({ ids: [hit.id] }));
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
        gridCtx = gridCanvas.getContext("2d");
        if (!editable) return;
        fogCtx = fogCanvas.getContext("2d");
        appState.map_confetti_function = confetti.create(confetti_canvas, {
            resize: true,
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
                invoke("send_marker_position", {
                    x: new_x,
                    y: new_y,
                    markerName: member.marker.name,
                });
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

    // Zoom scales the map from its top left corner, so zooming in makes the page
    // scrollable to the right and bottom. Below 100% it shrinks towards its center.
    let zoom_offset_x = $derived(
        editable && appState.zoom < 1 ? (w * (1 - appState.zoom)) / 2 : 0,
    );
    let zoom_offset_y = $derived(
        editable && appState.zoom < 1 ? (h * (1 - appState.zoom)) / 2 : 0,
    );
    let map_element: HTMLDivElement | null = $state(null);

    $effect(() => {
        if (editable && w && h) appState.map_aspect = h / w;
    });

    const MIN_ZOOM = 0.3;
    const MAX_ZOOM = 5;

    /** Zooms so that the map point under (client_x, client_y) stays under it. */
    function zoom_to(new_zoom: number, client_x: number, client_y: number) {
        if (!map_element) return;
        const old_zoom = appState.zoom;
        new_zoom = Math.min(Math.max(new_zoom, MIN_ZOOM), MAX_ZOOM);
        // Stop at 100% and at "fills the window height" when passing them. The
        // tolerance keeps rounding errors from stopping again right after a stop.
        const fit_height = (window.innerHeight - 30) / h;
        for (const stop of [1, fit_height]) {
            const at_stop = Math.abs(old_zoom - stop) < 0.001;
            const passes = (old_zoom - stop) * (new_zoom - stop) < 0;
            if (Math.abs(new_zoom - stop) < 0.001 || (passes && !at_stop)) {
                new_zoom = stop;
            }
        }
        if (new_zoom === old_zoom) return;

        const rect = map_element.getBoundingClientRect();
        const map_x = (client_x - rect.left) / old_zoom;
        const map_y = (client_y - rect.top) / old_zoom;
        appState.zoom = new_zoom;

        tick().then(() => {
            if (!map_element) return;
            const new_rect = map_element.getBoundingClientRect();
            window.scrollBy(
                new_rect.left + map_x * new_zoom - client_x,
                new_rect.top + map_y * new_zoom - client_y,
            );
        });
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
        appState.zoom_by = (factor: number) =>
            zoom_to(
                appState.zoom * factor,
                window.innerWidth / 2,
                window.innerHeight / 2,
            );

        return () => {
            window.removeEventListener("wheel", on_wheel);
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
            appState.selectedTool === Tools.None &&
            !on_marker &&
            map_element
        ) {
            if (!event.shiftKey) {
                selection.clear();
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
        const marker_px = (marker.size / columns) * window.innerWidth;
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="w-full relative select-none overflow-hidden"
    bind:this={map_element}
    use:dropTarget={editable && gameState.dm
        ? { name: "map", accepts: ["marker", "scene"], onDrop: on_drop }
        : null}
    onpointerdown={start_pan}
    onpointermove={pan}
    onpointerup={end_pan}
    onpointercancel={end_pan}
    style="transform-origin: 0 0; transform: {editable
        ? `translate(${zoom_offset_x}px, ${zoom_offset_y}px) scale(${appState.zoom})`
        : 'none'}"
>
    <Display
        asset={file}
        thumbnail={!editable}
        alt="Map"
        class="w-full"
        fetchpriority={editable ? "high" : "auto"}
    />
    <canvas
        bind:this={gridCanvas}
        bind:clientWidth={w}
        bind:clientHeight={h}
        width={w as number}
        height={h as number}
        class="absolute top-0 left-0 w-full h-full z-0 opacity-50"
    >
    </canvas>
    {#if editable}
        <!-- Effects canvas -->
        <canvas
            bind:this={confetti_canvas}
            width={w as number}
            height={h as number}
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
            width={w as number}
            height={h as number}
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
            <div
                class="absolute border-2 border-dashed pointer-events-none {appState.selectedTool ===
                Tools.AddFog
                    ? 'border-base-content bg-base-content/30'
                    : 'border-info bg-info/10'}"
                style="left: {Math.min(fog_rect.x1, fog_rect.x2) * size +
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
                class="absolute border-2 border-info bg-info/10 pointer-events-none"
                style="left: {Math.min(box.x1, box.x2) *
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
            <div
                role="banner"
                class="absolute origin-left"
                style="top: {(ruler_origin.y || 0) * size +
                    y_offset}px; left: {(ruler_origin.x || 0) * size +
                    x_offset}px;"
            >
                <div
                    class="origin-top-left block h-8 bg-base-100 text-base-content"
                    style="width: {ruler_size}px; transform: rotate({((ruler_angle ||
                        0) /
                        (2 * Math.PI)) *
                        360}deg);"
                >
                    <span
                        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-min h-1/2 flex justify-center items-center pointer-events-none p-2 rounded-box bg-base-100 {(ruler_angle ||
                            0) >
                            Math.PI / 2 || (ruler_angle || 0) < -Math.PI / 2
                            ? 'rotate-180'
                            : ''}"
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
        <button
            aria-label="Click Capture Layer"
            class="absolute inset-0 {appState.selectedTool === Tools.Draw
                ? 'cursor-crosshair'
                : ''}"
            onmousemove={(evt) => {
                if (!editable) return;
                if (appState.selectedTool === Tools.Draw) continue_drawing(evt);
                clickHandler(evt, false);
            }}
            onmousedown={(evt) => {
                if (!editable) return;
                if (appState.selectedTool === Tools.Draw) start_drawing(evt);
                clickHandler(evt, true);
            }}
            onmouseup={() => {
                finish_fog_rect();
                finish_drawing();
            }}
            oncontextmenu={(evt) => {
                if (editable && appState.selectedTool === Tools.Draw) {
                    delete_drawing_at(evt);
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
                    appState.selectedTool === Tools.Ruler
                ) {
                    let x = (evt.offsetX - x_offset) / size;
                    let y = (evt.offsetY - y_offset) / size;
                    ruler_origin = { x: x, y: y };
                }
            }}
        ></button>
    {/if}
</div>
