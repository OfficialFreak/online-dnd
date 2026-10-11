// Live positions of pointers and dragged markers. The desktop app sends them over QUIC
// as often as they change, a browser over its WebSocket and less often, as phones may
// have little bandwidth. The server passes them between both.
// @ts-ignore
import throttle from "just-throttle";
import { in_tauri, invoke_tauri } from "./platform";
import { appState, gameState } from "./state.svelte";
import {
    MarkerPosition,
    MousePosition,
} from "./types/messaging/client_messages";

/** Milliseconds between the positions a browser sends, about 15 a second */
const WEB_INTERVAL = 66;

const throttled_pointer = throttle(
    (x: number, y: number) => appState.ws?.send(MousePosition.create(x, y)),
    WEB_INTERVAL,
    { leading: true, trailing: true },
);

/** Each marker on its own, a group drag moves several at once */
const throttled_markers = new Map<string, (x: number, y: number) => void>();

export function send_pointer(x: number, y: number) {
    if (in_tauri) {
        invoke_tauri("send_mouse_position", { x, y, name: gameState.name });
    } else {
        throttled_pointer(x, y);
    }
}

export function send_marker_position(x: number, y: number, marker_name: string) {
    if (in_tauri) {
        invoke_tauri("send_marker_position", { x, y, markerName: marker_name });
        return;
    }
    let send = throttled_markers.get(marker_name);
    if (!send) {
        send = throttle(
            (x: number, y: number) =>
                appState.ws?.send(MarkerPosition.create(x, y, marker_name)),
            WEB_INTERVAL,
            { leading: true, trailing: true },
        );
        throttled_markers.set(marker_name, send!);
    }
    send!(x, y);
}
