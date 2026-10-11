import { asset_url } from "./assets";
import { appState, ensureStore } from "./state.svelte";

/** Music or a sound effect the DM can play for everyone */
export type Sound = {
    name: string;
    file: string;
    /** Music loops until the DM stops it, an effect plays once */
    kind: "music" | "effect";
};

export const audioState = $state({
    music_volume: 0.4,
    effect_volume: 0.8,
    muted: false,
    /** What is playing for everyone right now */
    music: null as { name: string; file: string; started_at: number } | null,
    /** The sound library, only DMs get it */
    sounds: [] as Sound[],
});

let music: HTMLAudioElement | null = null;

function music_volume() {
    return audioState.muted ? 0 : audioState.music_volume;
}

function effect_volume() {
    return audioState.muted ? 0 : audioState.effect_volume;
}

/** Timers instead of animation frames: those stop in a minimized window */
function fade(audio: HTMLAudioElement, to: number, done?: () => void) {
    const from = audio.volume;
    const steps = 24;
    let step = 0;
    const interval = setInterval(() => {
        step++;
        audio.volume = Math.min(
            1,
            Math.max(0, from + ((to - from) * step) / steps),
        );
        if (step >= steps) {
            clearInterval(interval);
            done?.();
        }
    }, 50);
}

/** started_at is when the DM started it, in milliseconds since 1970 */
export function play_music(name: string, file: string, started_at: number) {
    stop_music();
    const audio = new Audio(asset_url(file));
    audio.loop = true;
    audio.volume = 0;
    audio.addEventListener(
        "loadedmetadata",
        () => {
            // Everyone hears the same part of the song
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                audio.currentTime =
                    ((Date.now() - started_at) / 1000) % audio.duration;
            }
        },
        { once: true },
    );
    audio.play().catch((e) => console.error("Playing music failed", e));
    fade(audio, music_volume());
    music = audio;
    audioState.music = { name, file, started_at };
}

export function stop_music() {
    if (music) {
        const old = music;
        fade(old, 0, () => old.pause());
        music = null;
    }
    audioState.music = null;
}

export function play_effect(file: string) {
    const audio = new Audio(asset_url(file));
    audio.volume = effect_volume();
    audio.play().catch((e) => console.error("Playing a sound failed", e));
}

/** Sounds shorter than this are probably effects, not music */
const EFFECT_SECONDS = 30;

export function guess_sound_kind(file: string): Promise<Sound["kind"]> {
    return new Promise((resolve) => {
        const audio = new Audio(asset_url(file));
        const timeout = setTimeout(() => resolve("music"), 5000);
        audio.addEventListener(
            "loadedmetadata",
            () => {
                clearTimeout(timeout);
                resolve(audio.duration < EFFECT_SECONDS ? "effect" : "music");
            },
            { once: true },
        );
        audio.addEventListener("error", () => {
            clearTimeout(timeout);
            resolve("music");
        });
    });
}

/** Volumes are 0 to 1, they are remembered on this device */
export function set_volume(
    change: Partial<
        Pick<typeof audioState, "music_volume" | "effect_volume" | "muted">
    >,
) {
    Object.assign(audioState, change);
    if (music) music.volume = music_volume();
    // Sliders change a lot while dragging, the store only needs the end result
    clearTimeout(save_timeout);
    save_timeout = setTimeout(async () => {
        await ensureStore();
        await appState.store.set("audio", {
            music_volume: audioState.music_volume,
            effect_volume: audioState.effect_volume,
            muted: audioState.muted,
        });
        await appState.store.save();
    }, 500);
}

let save_timeout: ReturnType<typeof setTimeout> | undefined;

export async function load_volume() {
    await ensureStore();
    const saved = await appState.store.get("audio");
    if (saved) Object.assign(audioState, saved);
}
