import WebSocket from "@tauri-apps/plugin-websocket";
import { appState } from "./state.svelte";

async function connect(url: string) {
    if (appState.ws) {
        appState.ws.disconnect();
    }
    try {
        appState.ws = await WebSocket.connect(url);

        // Save original send method
        let originalSend = appState.ws.send.bind(appState.ws);

        // Override send method to log messages
        appState.ws.send = function (data: string) {
            try {
                console.log(`Sent ${JSON.parse(data).type}:`, JSON.parse(data));
            } catch {console.log("Sent:", data)}
            return originalSend(data);
        };
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

export {connect}