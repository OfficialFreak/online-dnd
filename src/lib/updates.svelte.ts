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
            // Just loaded for an update and still not the new one: once more would only
            // show the portal again, in a loop
            if (reloaded_lately()) {
                console.warn("Loaded anew for an update, but still the old version");
                return;
            }
            applying = true;
            close_dialogs();
            await portal_update(async () => {
                await leave();
                reload_fresh();
            });
        }
    } catch (e) {
        console.warn("Looking for an update failed", e);
    } finally {
        applying = false;
    }
}

const RELOADED_AT = "reloaded_for_update";

function reloaded_lately() {
    try {
        return Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < 2 * 60 * 1000;
    } catch {
        return false;
    }
}

/**
 * Loads the page anew under an address the browser has kept nothing for: a plain reload
 * gave Safari on an iPhone the old page again, which found the update again
 */
function reload_fresh() {
    try {
        sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {}
    const url = new URL(location.href);
    url.searchParams.set("v", Date.now().toString(36));
    location.replace(url);
}

/** The address without what reload_fresh added, once the page is there */
export function tidy_address() {
    const url = new URL(location.href);
    if (!url.searchParams.has("v")) return;
    url.searchParams.delete("v");
    history.replaceState(history.state, "", url);
}

let following: ReturnType<typeof setInterval> | undefined;

/**
 * After the server was updated. The desktop app's own update may still be being built
 * then, a few minutes: it looks again every two minutes for half an hour, instead of only
 * at the next half-hourly look.
 */
export function follow_server_update() {
    look_for_update();
    if (!in_tauri) return;
    clearInterval(following);
    const until = Date.now() + 30 * 60 * 1000;
    following = setInterval(() => {
        if (Date.now() > until) clearInterval(following);
        else look_for_update();
    }, 2 * 60 * 1000);
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
