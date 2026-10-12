import { asset_url } from "./assets";
import { in_tauri } from "./platform";
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
    // Quiet to begin with, louder ones startled when the music came in
    music_volume: 0.15,
    effect_volume: 0.5,
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

// iOS ignores the volume of audio elements, only its buttons set it. In the browser the
// sounds go through Web Audio, whose gain iOS follows. Not in the desktop app: its sounds
// come from another origin, which Web Audio would play as silence.
let context: AudioContext | null = null;
const gains = new WeakMap<HTMLAudioElement, GainNode>();

/** Sends the sound of this element through a gain node, if it can */
export function route_audio(audio: HTMLAudioElement) {
    if (in_tauri || typeof AudioContext === "undefined") return;
    try {
        if (new URL(audio.src, location.href).origin !== location.origin) return;
        if (!context) {
            context = new AudioContext();
            // It starts halted without a tap, and iOS halts it in the background
            document.addEventListener("pointerdown", wake_audio);
            document.addEventListener("visibilitychange", wake_audio);
        }
        const gain = context.createGain();
        context.createMediaElementSource(audio).connect(gain).connect(context.destination);
        gains.set(audio, gain);
    } catch (e) {
        console.error("Routing a sound through Web Audio failed", e);
    }
}

function wake_audio() {
    if (context && context.state !== "running" && !document.hidden) {
        context.resume().catch(() => {});
    }
}

function level(audio: HTMLAudioElement) {
    return gains.get(audio)?.gain.value ?? audio.volume;
}

/** The volume of a sound from 0 to 1, by its gain node or by itself */
export function set_audio_level(audio: HTMLAudioElement, value: number) {
    const gain = gains.get(audio);
    if (gain) gain.gain.value = value;
    else audio.volume = value;
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
function fade(
    audio: HTMLAudioElement,
    to: () => number,
    done?: () => void,
    duration = 1200,
) {
    const from = level(audio);
    const steps = Math.round(duration / 50);
    let step = 0;
    const interval = setInterval(() => {
        step++;
        set_audio_level(
            audio,
            Math.min(1, Math.max(0, from + ((to() - from) * step) / steps)),
        );
        if (step >= steps) {
            clearInterval(interval);
            done?.();
        }
    }, 50);
}

/**
 * How far the song was when the server sent it, by the server's clock, and when that
 * arrived here. The clocks of phones and computers may be off by seconds.
 */
let song_clock = { elapsed: 0, received: 0 };

/** Where everyone is in the song now, in seconds */
function song_position(audio: HTMLAudioElement) {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return null;
    const elapsed = song_clock.elapsed + performance.now() - song_clock.received;
    return (elapsed / 1000) % audio.duration;
}

/** How far the song is off, the end and the start of a loop lie next to each other */
function drift(audio: HTMLAudioElement, position: number) {
    const apart = Math.abs(audio.currentTime - position);
    return Math.min(apart, audio.duration - apart);
}

/** Everyone hears the same part of the song */
function catch_up(audio: HTMLAudioElement) {
    const position = song_position(audio);
    if (position !== null) audio.currentTime = position;
}

/**
 * Corrects the song once it really plays, as loading, buffering after the jump and the
 * tap iOS waits for take a while. Later it keeps it in step, e.g. after a stall.
 */
function keep_in_step(audio: HTMLAudioElement) {
    let corrections = 0;
    audio.addEventListener("play", () => (corrections = 0));
    audio.addEventListener("playing", () => {
        const position = song_position(audio);
        // A jump buffers again, so only a few times in a row
        if (position === null || corrections >= 3) return;
        if (drift(audio, position) > 0.3) {
            corrections++;
            audio.currentTime = position;
        }
    });
    const timer = setInterval(() => {
        if (audio !== music) {
            clearInterval(timer);
            return;
        }
        const position = song_position(audio);
        if (!audio.paused && position !== null && drift(audio, position) > 1) {
            audio.currentTime = position;
        }
    }, 15_000);
}

/** iOS plays sound only after a tap, then it starts with the next one */
function play_or_wait(audio: HTMLAudioElement) {
    wake_audio();
    audio.play().catch((e) => {
        console.error("Playing music failed", e);
        document.addEventListener(
            "pointerdown",
            () => {
                if (audio !== music) return;
                catch_up(audio);
                audio.play().catch(() => {});
            },
            { once: true },
        );
    });
}

/**
 * started_at is when the DM started it and sent_at when the server sent it, both by the
 * server's clock in milliseconds since 1970. Older servers send no sent_at.
 */
export function play_music(
    name: string,
    file: string,
    started_at: number,
    sent_at?: number,
) {
    song_clock = {
        elapsed: (sent_at ?? Date.now()) - started_at,
        received: performance.now(),
    };
    // The same song again, after connecting anew, plays on instead of starting over
    if (
        music &&
        audioState.music?.file === file &&
        audioState.music.started_at === started_at
    ) {
        if (music.paused && !document.hidden) {
            catch_up(music);
            play_or_wait(music);
        }
        return;
    }
    stop_music();
    const audio = new Audio(asset_url(file));
    audio.loop = true;
    route_audio(audio);
    set_audio_level(audio, 0);
    audio.addEventListener("loadedmetadata", () => catch_up(audio), {
        once: true,
    });
    keep_in_step(audio);
    play_or_wait(audio);
    // Slowly, music coming in at once is a jump scare
    fade(audio, playing_music_volume, undefined, 3000);
    music = audio;
    audioState.music = { name, file, started_at };
}

// Phones and tablets pause the music while the app is in the background, and play on
// where everyone else is when it comes back. The desktop keeps playing in other windows.
if (typeof document !== "undefined" && !in_tauri && navigator.maxTouchPoints > 0) {
    document.addEventListener("visibilitychange", () => {
        if (!music || !audioState.music) return;
        if (document.hidden) {
            music.pause();
        } else {
            catch_up(music);
            play_or_wait(music);
        }
    });
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
    route_audio(audio);
    set_audio_level(audio, effect_volume());
    wake_audio();
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
    if (music) set_audio_level(music, playing_music_volume());
    for (const playing of effects.values()) {
        for (const audio of playing) set_audio_level(audio, effect_volume());
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
