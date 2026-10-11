import { asset_url } from "./assets";
import type { TabletopTrack } from "./sound-library";
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
    /** The tracks of Tabletop Audio, once the DM opened the library */
    tabletop: null as TabletopTrack[] | null,
    /** Names of sounds the server is downloading from a library */
    importing: [] as string[],
    /** Names of the effects playing right now */
    effects: [] as string[],
});

let music: HTMLAudioElement | null = null;
/** Pressure plays its own music, the DM's waits silently underneath */
let ducked = false;
/** An effect the DM plays again before it ends plays twice at once */
const effects = new Map<string, Set<HTMLAudioElement>>();

export function music_volume() {
    return audioState.muted ? 0 : audioState.music_volume;
}

export function effect_volume() {
    return audioState.muted ? 0 : audioState.effect_volume;
}

function playing_music_volume() {
    return ducked ? 0 : music_volume();
}

/** Fades the DM's music out while something else plays and back in afterwards */
export function duck_music(on: boolean) {
    if (ducked === on) return;
    ducked = on;
    if (music) fade(music, playing_music_volume);
}

/**
 * Timers instead of animation frames: those stop in a minimized window. The target is
 * read on every step, so a volume changed during the fade isn't undone.
 */
function fade(audio: HTMLAudioElement, to: () => number, done?: () => void) {
    const from = audio.volume;
    const steps = 24;
    let step = 0;
    const interval = setInterval(() => {
        step++;
        audio.volume = Math.min(
            1,
            Math.max(0, from + ((to() - from) * step) / steps),
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
    fade(audio, playing_music_volume);
    music = audio;
    audioState.music = { name, file, started_at };
}

export function stop_music() {
    if (music) {
        const old = music;
        fade(old, () => 0, () => old.pause());
        music = null;
    }
    audioState.music = null;
}

export function play_effect(name: string, file: string) {
    const audio = new Audio(asset_url(file));
    audio.volume = effect_volume();
    const playing = effects.get(name) ?? new Set();
    playing.add(audio);
    effects.set(name, playing);
    audioState.effects = [...effects.keys()];
    const done = () => forget_effect(name, audio);
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.play().catch((e) => {
        console.error("Playing a sound failed", e);
        done();
    });
}

function forget_effect(name: string, audio: HTMLAudioElement) {
    const playing = effects.get(name);
    if (!playing?.delete(audio)) return;
    if (playing.size === 0) effects.delete(name);
    audioState.effects = [...effects.keys()];
}

export function stop_effect(name: string) {
    for (const audio of effects.get(name) ?? []) {
        forget_effect(name, audio);
        fade(audio, () => 0, () => audio.pause());
    }
}

export function stop_all_sounds() {
    stop_music();
    for (const name of [...effects.keys()]) stop_effect(name);
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
    if (music) music.volume = playing_music_volume();
    for (const playing of effects.values()) {
        for (const audio of playing) audio.volume = effect_volume();
    }
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
