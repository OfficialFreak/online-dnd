/**
 * The intro between two scenes: smoke closes over the old scene, the new one is shown
 * underneath while its name unrolls on a scroll, then the smoke draws back from it.
 */
import { tick } from "svelte";
import { appState, gameState } from "./state.svelte";
import { hold_sound, release_sound } from "./audio.svelte";
import {
    gate_stars,
    play_portal_enter,
    play_portal_leave,
    play_scene_close,
} from "./portal-sounds";
import type { SceneData } from "./types/messaging/server_messages";

type Intro = {
    /** Closes the smoke over the map, resolved once it covers it */
    cover(): Promise<void>;
    /** Shows the name and draws the smoke back once the map is there */
    reveal(name: string, ready: Promise<unknown>): void;
    /** Covers the map with smoke at once */
    veil(): void;
    /** Draws the smoke back without a name once ready */
    lift(ready: Promise<unknown>): void;
    /** Closes the smoke and unrolls the scroll with this, which stays */
    announce(text: string): Promise<void>;
    /**
     * Asks for a tap over the covered screen, which also lets the browser play sound. The
     * smoke draws back only after it. True once tapped, false if the ask made way for an
     * update's scroll.
     */
    knock(): Promise<boolean>;
    /** Enters as if tapped, while it asks to */
    enter(): void;
};

let intro: Intro | null = null;
/** The ask to enter is shown, the portal is closed already */
let at_gate = false;
/** Came through the gate with a tap, the portal woven anew lets them in again */
let entered = false;

/**
 * Set before an update loads the page again or starts the app anew, for someone who had
 * entered: they are let in again without a tap, the portal still opens. In localStorage,
 * the desktop app starts anew. Only for a few minutes, a later opening asks again.
 */
const REENTER = "reenter_after_update";
const REENTER_MS = 3 * 60 * 1000;

function remember_entered() {
    if (!entered) return;
    try {
        localStorage.setItem(REENTER, String(Date.now()));
    } catch {}
}

function take_reentry() {
    try {
        const at = Number(localStorage.getItem(REENTER) ?? 0);
        localStorage.removeItem(REENTER);
        return Date.now() - at < REENTER_MS;
    } catch {
        return false;
    }
}
/**
 * Opening the app, smoke covers it until the first map is there and then draws back: the
 * map and all on it came in bit by bit before
 */
let opening = true;

let intro_shown: () => void;
/** Resolved once the page with the map can show the intro */
export const intro_ready = new Promise<void>((resolve) => (intro_shown = resolve));

/** The page with the map shows the intro, without it scenes change at once */
export function register_intro(shown: Intro | null) {
    intro = shown;
    if (shown) intro_shown();
    // Also hidden: the desktop app loads the page in its window before it shows it, after
    // the loading screen, and opened without the portal there
    if (!shown || !opening || !appState.scene_intro) return;
    shown.veil();
    // Every time, the user likes the look of it, also where sound plays without a tap.
    // No music before, also where it could play, as in the desktop app: it comes in as the
    // portal opens.
    hold_sound();
    at_gate = true;
    // Where sound plays without a tap, the stars glint while the gate waits. The tap's own
    // sound takes over from them, see SceneIntro.svelte.
    const end_stars = gate_stars();
    shown.knock().then((tapped) => {
        at_gate = false;
        entered ||= tapped;
        end_stars(tapped ? 0.9 : 0.3);
        if (tapped) release_sound();
    });
    // Back after an update they had entered before: in again, as if tapped. Where the
    // browser wants a tap for sound, the next tap anywhere brings it.
    if (take_reentry()) shown.enter();
    // The scene came first: the desktop app connects behind its loading screen, before
    // the page with the map is there
    if (gameState.scene) {
        opening = false;
        shown.lift(map_loaded(gameState.scene.map));
        return;
    }
    // Without a scene to show, e.g. none is active, it draws back on its own
    setTimeout(() => {
        if (!opening) return;
        opening = false;
        intro?.lift(Promise.resolve());
    }, 5000);
}

/**
 * Announces a new version over the map, the portal being woven anew, then applies it: the
 * page loads again or the app starts anew. If that fails the smoke draws back.
 */
export async function portal_update(apply: () => unknown) {
    try {
        // The sound fades with the smoke closing, nothing new plays while it is woven but
        // the portal's own
        hold_sound(1100);
        if (intro) play_portal_leave();
        await intro?.announce("Das Portal wird neu gewoben");
        remember_entered();
        await apply();
    } catch (e) {
        console.error("Updating failed", e);
        release_sound();
        intro?.lift(Promise.resolve());
    }
}

/**
 * The server was updated and this is the newest version already: the portal is woven anew
 * all the same, it closes and draws back, as with an update of the app
 */
export async function portal_rewoven() {
    if (!intro || at_gate) return;
    hold_sound(1100);
    play_portal_leave();
    try {
        await intro.announce("Das Portal wird neu gewoben");
    } finally {
        release_sound();
        // Entered anew as it draws back
        play_portal_enter();
        intro?.lift(Promise.resolve());
    }
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
    if (opening) {
        show(scene);
        // Before the page with the map is there, it opens through the portal then
        if (!intro) return;
        // The first scene as the app opens, behind the smoke that covers it already
        opening = false;
        await tick();
        await drawn();
        intro.lift(map_loaded(scene.map));
        return;
    }
    const other = !!gameState.scene && gameState.scene.name !== scene.name;
    if (!intro || !other || !appState.scene_intro || document.hidden) {
        show(scene);
        return;
    }
    waiting = scene;
    // Not while the gate waits for the tap, which has its own sound
    if (!at_gate) play_scene_close();
    try {
        await intro.cover();
    } finally {
        const latest = waiting;
        waiting = null;
        show(latest);
        // The new scene works itself out and is drawn once behind the still smoke before
        // the scroll moves: its walls and lights take a while on a big map, and the
        // scroll stuttered while they did
        await tick();
        await drawn();
        intro?.reveal(latest.name, map_loaded(latest.map));
    }
}

/**
 * Once the page draws calmly again: two frames in a row without a hold-up, at most after
 * a little more than a second, or soon in a window that draws none
 */
function drawn() {
    return new Promise<void>((resolve) => {
        const start = performance.now();
        let last = start;
        let calm = 0;
        const timeout = setTimeout(resolve, 1200);
        const frame = (now: number) => {
            calm = now - last < 30 ? calm + 1 : 0;
            last = now;
            if (calm >= 2 || now - start > 1200) {
                clearTimeout(timeout);
                resolve();
            } else {
                requestAnimationFrame(frame);
            }
        };
        requestAnimationFrame(frame);
    });
}

/**
 * Resolves once the map on the page has loaded, a video with its first frame. Asked of the
 * map itself: decoding it apart, up to 8192 pixels a side, held everything up for a third
 * of a second, the page only decodes it as large as it is shown.
 */
export function map_loaded(file: string) {
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
