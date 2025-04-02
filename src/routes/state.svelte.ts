import type { Store } from "@tauri-apps/plugin-store";
import type WebSocket from "@tauri-apps/plugin-websocket";

export const appState = $state({
    ws: null as WebSocket | null,
    store: null as Store | null,
    base_url: "localhost:3030"
});

export const gameState = $state({
    name: "Unknown Player",
    dm: false
});
