import { updated } from "$app/state";
import { in_tauri, invoke_tauri } from "./platform";
import { portal_update } from "./scene-intro.svelte";

let applying = false;

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
            await portal_update(() => invoke_tauri("install_update"));
        } else {
            if (!updated.current && !(await updated.check())) return;
            applying = true;
            await portal_update(() => location.reload());
        }
    } catch (e) {
        console.warn("Looking for an update failed", e);
    } finally {
        applying = false;
    }
}
