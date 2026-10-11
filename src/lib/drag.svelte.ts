// Dragging things from the side panels onto the map.
//
// This deliberately uses plain pointer events instead of HTML5 drag and drop
// or neodrag: Tauri's file drop handler swallows HTML5 drag events on Windows,
// and neodrag only moves elements inside their own container.
import type { MarkerTemplate, Scene } from "./types/messaging/server_messages";

export type DragPayload =
    | { kind: "marker"; marker: MarkerTemplate }
    | { kind: "scene"; scene: Scene };

export type DropHandler = (
    payload: DragPayload,
    event: PointerEvent,
    target: HTMLElement,
) => void;

export const dragState = $state({
    payload: null as DragPayload | null,
    x: 0,
    y: 0,
    /** Name of the drop target under the pointer, if it accepts the payload */
    over: null as string | null,
});

/** Which panel files from the OS are currently dragged over */
export const fileDropState = $state({
    over: null as string | null,
});

type DropTarget = {
    name: string;
    accepts: DragPayload["kind"][];
    onDrop: DropHandler;
};

const dropTargets = new WeakMap<Element, DropTarget>();
const DRAG_THRESHOLD = 5;

function findDropTarget(x: number, y: number) {
    let element = document.elementFromPoint(x, y);
    while (element) {
        const target = dropTargets.get(element);
        if (
            target &&
            dragState.payload &&
            target.accepts.includes(dragState.payload.kind)
        ) {
            return { element: element as HTMLElement, target };
        }
        element = element.parentElement;
    }
    return null;
}

/** Makes an element something that can be dragged onto a drop target. Pass null to disable. */
export function dragSource(node: HTMLElement, payload: DragPayload | null) {
    let current = payload;
    let start: { x: number; y: number; pointerId: number } | null = null;
    let suppressClick = false;

    function cancel() {
        start = null;
        dragState.payload = null;
        dragState.over = null;
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
    }

    function onPointerCancel(e: PointerEvent) {
        if (start && e.pointerId === start.pointerId) cancel();
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") cancel();
    }

    function onPointerDown(e: PointerEvent) {
        if (e.button !== 0 || !current) return;
        // Buttons inside the source keep working as usual
        const control = (e.target as HTMLElement).closest(
            "button, input, select, a",
        );
        if (control && control !== node && node.contains(control)) return;
        start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
        // Capturing keeps hover menus of map markers from opening while dragging over them
        try {
            node.setPointerCapture(e.pointerId);
        } catch {
            // The pointer is already gone again
        }
        // On the window: Safari stops sending a finger's moves to the source once the
        // panel it is in makes room for the drag
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
    }

    function onPointerMove(e: PointerEvent) {
        if (!start || e.pointerId !== start.pointerId) return;
        if (!dragState.payload) {
            if (
                !current ||
                Math.hypot(e.clientX - start.x, e.clientY - start.y) <
                    DRAG_THRESHOLD
            )
                return;
            dragState.payload = current;
            window.addEventListener("keydown", onKeyDown);
        }
        dragState.x = e.clientX;
        dragState.y = e.clientY;
        dragState.over =
            findDropTarget(e.clientX, e.clientY)?.target.name ?? null;
    }

    function onPointerUp(e: PointerEvent) {
        if (!start || e.pointerId !== start.pointerId) return;
        const payload = dragState.payload;
        const found = payload ? findDropTarget(e.clientX, e.clientY) : null;
        cancel();
        if (!payload) return;

        // The pointer was released over the source, which would count as a click
        suppressClick = true;
        setTimeout(() => (suppressClick = false));
        found?.target.onDrop(payload, e, found.element);
    }

    function onClick(e: MouseEvent) {
        if (!suppressClick) return;
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
    }

    function onNativeDragStart(e: DragEvent) {
        e.preventDefault();
    }

    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("click", onClick, true);
    node.addEventListener("dragstart", onNativeDragStart);
    // iOS would offer to save or share the image on a long press
    node.style.setProperty("-webkit-touch-callout", "none");

    return {
        update(payload: DragPayload | null) {
            current = payload;
        },
        destroy() {
            if (start) cancel();
            node.removeEventListener("pointerdown", onPointerDown);
            node.removeEventListener("click", onClick, true);
            node.removeEventListener("dragstart", onNativeDragStart);
        },
    };
}

/** Lets an element receive dragged payloads. Pass null to disable. */
export function dropTarget(node: HTMLElement, target: DropTarget | null) {
    if (target) dropTargets.set(node, target);
    return {
        update(target: DropTarget | null) {
            if (target) {
                dropTargets.set(node, target);
            } else {
                dropTargets.delete(node);
            }
        },
        destroy() {
            dropTargets.delete(node);
        },
    };
}
