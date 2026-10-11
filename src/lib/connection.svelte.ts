import { appState } from "./state.svelte";
import { in_tauri } from "./platform";

/** What the WebSocket plugin of Tauri passes to listeners */
export type SocketMessage =
    | { type: "Text"; data: string }
    | { type: "Binary" | "Ping" | "Pong"; data: number[] }
    | { type: "Close"; data: unknown };

/** The connection to the server, Tauri's WebSocket plugin or the browser's WebSocket */
export type GameSocket = {
    send(data: string): Promise<void>;
    addListener(listener: (message: SocketMessage) => void): () => void;
    disconnect(): Promise<void>;
};

/** The browser's WebSocket, shaped like Tauri's plugin */
function browser_socket(url: string): Promise<GameSocket> {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const listeners = new Set<(message: SocketMessage) => void>();
        const game_socket: GameSocket = {
            async send(data) {
                socket.send(data);
            },
            addListener(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            async disconnect() {
                socket.close();
            },
        };
        socket.addEventListener("message", (event) => {
            for (const listener of listeners) {
                listener({ type: "Text", data: String(event.data) });
            }
        });
        socket.addEventListener("close", (event) => {
            for (const listener of listeners) {
                listener({
                    type: "Close",
                    data: { code: event.code, reason: event.reason },
                });
            }
        });
        // A connection that never opens nor fails, e.g. on a phone's flaky network, would
        // hold up the retries forever
        const timeout = setTimeout(() => {
            socket.close();
            reject(new Error("Connecting timed out"));
        }, CONNECT_TIMEOUT);
        socket.addEventListener(
            "open",
            () => {
                clearTimeout(timeout);
                resolve(game_socket);
            },
            { once: true },
        );
        socket.addEventListener(
            "error",
            () => {
                clearTimeout(timeout);
                reject(new Error("Connecting failed"));
            },
            { once: true },
        );
    });
}

const CONNECT_TIMEOUT = 8000;

async function connect(url: string) {
    if (appState.ws) {
        try {
            await appState.ws.disconnect();
        } catch {}
    }
    try {
        if (in_tauri) {
            const { default: TauriSocket } = await import(
                "@tauri-apps/plugin-websocket"
            );
            appState.ws = (await TauriSocket.connect(url)) as GameSocket;
        } else {
            appState.ws = await browser_socket(url);
        }

        // Save original send method
        let originalSend = appState.ws.send.bind(appState.ws);

        // Override send method to log messages
        appState.ws.send = function (data: string) {
            try {
                console.log(`Sent ${JSON.parse(data).type}:`, JSON.parse(data));
            } catch {
                console.log("Sent:", data);
            }
            return originalSend(data);
        };
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

export { connect };
