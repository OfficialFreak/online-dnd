import { updated } from "$app/state";
import { in_tauri, invoke_tauri } from "./platform";
import { appState } from "./state.svelte";
import { intro_ready, portal_update } from "./scene-intro.svelte";

let applying = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * At once, as everyone is kicked out for a few seconds and comes back: open dialogs close,
 * they would stay over the smoke
 */
function close_dialogs() {
    for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog[open]")) {
        dialog.close();
    }
}

/**
 * Leaves the game cleanly before the page loads again or the app starts anew: a dragged
 * marker goes back and is freed, what is still being saved goes out, and the connection
 * closes, so the server frees every marker this one held at once
 */
async function leave() {
    appState.end_drag?.();
    await wait(600);
    const ws = appState.ws;
    // Not taken for a lost connection that tries again
    appState.ws = null;
    await ws?.disconnect().catch(() => {});
}

/**
 * Looks for a newer version and applies it at once, announced over the map: the desktop app
 * installs it and starts anew, the web version loads again. An app left open for days ran
 * an old version against a newer server.
 */
export async function look_for_update() {
    if (applying) return;
    try {
        if (in_tauri) {
            const version = await invoke_tauri<string | null>("update_version");
            if (!version) return;
            applying = true;
            close_dialogs();
            await portal_update(async () => {
                await leave();
                // Not installed, e.g. offline: loaded again it connects again
                await invoke_tauri("install_update").catch(() => location.reload());
            });
        } else {
            if (!updated.current && !(await updated.check())) return;
            applying = true;
            close_dialogs();
            await portal_update(async () => {
                await leave();
                location.reload();
            });
        }
    } catch (e) {
        console.warn("Looking for an update failed", e);
    } finally {
        applying = false;
    }
}

/**
 * Looks once the app has opened, also in the desktop app, which updated without a word
 * while starting: the update shows over the map then like any other, the smoke covers it
 * already
 */
export async function look_for_update_on_opening() {
    await Promise.race([intro_ready, new Promise((resolve) => setTimeout(resolve, 5000))]);
    await look_for_update();
}
