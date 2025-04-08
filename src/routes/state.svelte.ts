import type { SceneData, Scene } from "$lib/types/messaging/server_messages";
import { load, type Store } from "@tauri-apps/plugin-store";
import type WebSocket from "@tauri-apps/plugin-websocket";
import {SvelteSet} from "svelte/reactivity";	

export const appState = $state({
    token: null as string | null,
    ws: null as WebSocket | null,
    store: null as Store | null,
    secure: false,
    base_url: "localhost:3030"
});

export const gameState = $state({
    name: "Unknown Player",
    dm: false,
    scene: null as SceneData | null,
    scenes: [] as Scene[],
    resources: new SvelteSet() as SvelteSet<string>,
    pressure: false
});

export async function ensureStore() {
    if (!appState.store) {
        appState.store = await load('store.json', { autoSave: false });
    }
}