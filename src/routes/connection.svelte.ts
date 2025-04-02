import WebSocket from "@tauri-apps/plugin-websocket";
import { appState } from "./state.svelte";

async function connect(url: string) {
    try {
        appState.ws = await WebSocket.connect(url);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

export {connect}