import WebSocket from "@tauri-apps/plugin-websocket";
import { userState } from "./state.svelte";

/**
 * @param {string} url
 */
async function connect(url) {
    try {
        // @ts-ignore
        userState.ws = await WebSocket.connect(url);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

export {connect}