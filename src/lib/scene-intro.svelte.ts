/**
 * The intro between two scenes: smoke closes over the old scene, the new one is shown
 * underneath while its name unrolls on a scroll, then the smoke draws back from it.
 */
import { asset_url } from "./assets";
import { appState, gameState } from "./state.svelte";
import type { SceneData } from "./types/messaging/server_messages";

type Intro = {
    /** Closes the smoke over the map, resolved once it covers it */
    cover(): Promise<void>;
    /** Shows the name and draws the smoke back once the map is there */
    reveal(name: string, ready: Promise<unknown>): void;
};

let intro: Intro | null = null;

/** The page with the map shows the intro, without it scenes change at once */
export function register_intro(shown: Intro | null) {
    intro = shown;
}

/** The scene shown once the smoke covers the old one, the newest if more came */
let waiting: SceneData | null = null;

/** Shows a scene the server sent, with the intro if it is another one than before */
export async function change_scene(
    scene: SceneData,
    show: (scene: SceneData) => void,
) {
    if (waiting) {
        waiting = scene;
        return;
    }
    const other = !!gameState.scene && gameState.scene.name !== scene.name;
    if (!intro || !other || !appState.scene_intro || document.hidden) {
        show(scene);
        return;
    }
    waiting = scene;
    try {
        await intro.cover();
    } finally {
        const latest = waiting;
        waiting = null;
        show(latest);
        intro?.reveal(latest.name, loaded(latest.map));
    }
}

/** Resolves once the map can be shown, a video shows its still frame first */
function loaded(file: string) {
    const image = new Image();
    image.src = asset_url(file.toLowerCase().endsWith(".mp4") ? `${file}_still.webp` : file);
    return image.decode().catch(() => {});
}
