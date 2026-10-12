/**
 * The intro between two scenes: smoke closes over the old scene, the new one is shown
 * underneath while its name unrolls on a scroll, then the smoke draws back from it.
 */
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

/**
 * Resolves once the map on the page has loaded, a video with its first frame. Asked of the
 * map itself: decoding it apart, up to 8192 pixels a side, held everything up for a third
 * of a second, the page only decodes it as large as it is shown.
 */
function loaded(file: string) {
    return new Promise<void>((resolve) => {
        const look = () => {
            const media = document.querySelector('[data-map="main"]');
            const shown =
                !!media && (media.getAttribute("src") ?? "").includes(`/assets/${file}?`);
            const ready =
                media instanceof HTMLImageElement
                    ? media.complete && media.naturalWidth > 0
                    : media instanceof HTMLVideoElement &&
                      media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
            if (shown && ready) resolve();
            else setTimeout(look, 100);
        };
        look();
    });
}
