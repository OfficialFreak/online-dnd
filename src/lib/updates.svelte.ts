import { updated } from "$app/state";
import { in_tauri, invoke_tauri } from "./platform";
import { appState } from "./state.svelte";
import { intro_ready, portal_rewoven, portal_update } from "./scene-intro.svelte";

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
 * an old version against a newer server. True if there was one.
 */
export async function look_for_update(): Promise<boolean> {
    if (applying) return true;
    try {
        if (in_tauri) {
            const version = await invoke_tauri<string | null>("update_version");
            if (!version) return false;
            applying = true;
            close_dialogs();
            await portal_update(async () => {
                await leave();
                // Not installed, e.g. offline: loaded again it connects again
                await invoke_tauri("install_update").catch(() => location.reload());
            });
            return true;
        } else {
            if (!updated.current && !(await updated.check())) return false;
            applying = true;
            close_dialogs();
            await portal_update(async () => {
                await leave();
                reload_fresh();
            });
            return true;
        }
    } catch (e) {
        console.warn("Looking for an update failed", e);
        return false;
    } finally {
        applying = false;
    }
}

/**
 * Loads the page anew under an address the browser has kept nothing for: a plain reload
 * gave Safari on an iPhone the old page again, which found the update again
 */
function reload_fresh() {
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
 * After the server was updated: the portal is woven anew, with the app's update if there is
 * one. The desktop app's own update may still be being built then, a few minutes: it looks
 * again every two minutes for half an hour, instead of only at the next half-hourly look.
 */
export async function follow_server_update() {
    if (in_tauri) {
        clearInterval(following);
        const until = Date.now() + 30 * 60 * 1000;
        following = setInterval(() => {
            if (Date.now() > until) clearInterval(following);
            else look_for_update();
        }, 2 * 60 * 1000);
    }
    if (!(await look_for_update())) await portal_rewoven();
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
