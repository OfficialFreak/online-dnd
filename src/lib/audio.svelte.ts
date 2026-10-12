import { asset_url } from "./assets";
import { in_tauri } from "./platform";
import type { TabletopTrack } from "./sound-library";
import { appState, ensureStore } from "./state.svelte";
import { MessageTypes, notify } from "./notifications.svelte";

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

/** The music playing for everyone, the music player while a song plays */
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

/** Whether the server's files come from the page's own origin */
function assets_same_origin() {
    try {
        const server = `${appState.secure ? "https://" : "http://"}${appState.baseUrl}`;
        return new URL(server).origin === location.origin;
    } catch {
        return false;
    }
}

/** Sends the sound of this element through a gain node, if it can */
export function route_audio(audio: HTMLAudioElement) {
    if (in_tauri || typeof AudioContext === "undefined" || gains.has(audio)) return;
    try {
        // Without a file yet it is one of the reused players for the server's files
        const same_origin = audio.getAttribute("src")
            ? new URL(audio.src, location.href).origin === location.origin
            : assets_same_origin();
        if (!same_origin) return;
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

// iOS lets an audio element play only once a tap started it, and a new element for each
// song or effect waited for the next tap every time. The players are reused, and the
// first tap anywhere unlocks all of them.
const SILENCE =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const players = new Set<HTMLAudioElement>();
const unlocked = new WeakSet<HTMLAudioElement>();
let listening_for_tap = false;

/** Lets the first tap unlock this element, also on iOS */
export function keep_unlocked(audio: HTMLAudioElement) {
    players.add(audio);
    if (listening_for_tap || typeof document === "undefined") return;
    listening_for_tap = true;
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
}

function unlock() {
    wake_audio();
    for (const audio of players) {
        if (unlocked.has(audio)) continue;
        unlocked.add(audio);
        // A song waiting for this tap plays, the others play a moment of silence
        if (audio === music) {
            audio.play().catch(() => {});
            continue;
        }
        audio.src = SILENCE;
        audio
            .play()
            .then(() => {
                if (audio.src === SILENCE) audio.pause();
            })
            .catch(() => {});
    }
}

const fades = new WeakMap<HTMLAudioElement, ReturnType<typeof setInterval>>();

/** Fades the DM's music out while something else plays and back in afterwards */
export function duck_music(on: boolean) {
    if (ducked === on) return;
    ducked = on;
    if (music) fade(music, playing_music_volume);
}

/**
 * Timers instead of animation frames: those stop in a minimized window. The target is
 * read on every step, so a volume changed during the fade isn't undone. A new fade of the
 * same element replaces the one before.
 */
function fade(
    audio: HTMLAudioElement,
    to: () => number,
    done?: () => void,
    duration = 1200,
) {
    clearInterval(fades.get(audio));
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
            fades.delete(audio);
            done?.();
        }
    }, 50);
    fades.set(audio, interval);
}

/**
 * How far the song was when the server sent it, by the server's clock, and when that
 * arrived here. The clocks of phones and computers may be off by seconds.
 */
let song_clock = { elapsed: 0, received: 0 };

/**
 * The length of the song in seconds, null while unknown. iOS loads a song only once it
 * plays, and may call its length infinite, then how far it can seek tells.
 */
function song_length(audio: HTMLAudioElement) {
    if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    const ranges = audio.seekable;
    const end = ranges.length > 0 ? ranges.end(ranges.length - 1) : 0;
    return Number.isFinite(end) && end > 0 ? end : null;
}

/**
 * Where everyone is in the song now, in seconds. Null while its length is unknown: a jump
 * past its end would start it over.
 */
function song_position(audio: HTMLAudioElement) {
    const length = song_length(audio);
    if (length === null) return null;
    const seconds =
        (song_clock.elapsed + performance.now() - song_clock.received) / 1000;
    return seconds % length;
}

/** How far the song is off, the end and the start of a loop lie next to each other */
function drift(audio: HTMLAudioElement, position: number) {
    const apart = Math.abs(audio.currentTime - position);
    const length = song_length(audio) ?? Infinity;
    return Math.min(apart, length - apart);
}

/**
 * Everyone hears the same part of the song. Only while it plays: iOS loses a jump made
 * before, keeps it pending and queues every later jump behind it, so the song stays where
 * it started and its time stands still.
 */
function catch_up(audio: HTMLAudioElement) {
    if (
        audio.paused ||
        audio.seeking ||
        audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
    ) {
        return;
    }
    const position = song_position(audio);
    if (position === null) return;
    try {
        audio.currentTime = position;
    } catch {
        // Not seekable yet, the next correction tries again
    }
}

/** Where the music is and should be, in seconds, for the volume menu */
export function music_progress() {
    if (!music) return null;
    const expected = song_position(music);
    return {
        position: music.currentTime,
        length: song_length(music),
        // The length only guessed from how far it can seek
        guessed: !Number.isFinite(music.duration),
        expected,
        off: expected === null ? null : drift(music, expected),
        paused: music.paused,
        seeking: music.seeking,
    };
}

/**
 * Corrects the song once it really plays, as loading, buffering after the jump and the tap
 * iOS waits for take a while. Later it keeps it in step, e.g. after a stall.
 */
function keep_in_step(audio: HTMLAudioElement) {
    let corrections = 0;
    const correct = () => {
        // A jump loads again, so only a few times in a row
        if (audio !== music || corrections >= 3) return;
        const position = song_position(audio);
        if (position !== null && drift(audio, position) > 0.3) {
            corrections++;
            catch_up(audio);
        }
    };
    audio.addEventListener("play", () => (corrections = 0));
    // Playing again after the jump checks whether it landed
    for (const type of ["playing", "durationchange"]) {
        audio.addEventListener(type, correct);
    }
    setInterval(() => {
        if (audio !== music || audio.paused) return;
        const position = song_position(audio);
        if (position !== null && drift(audio, position) > 1) catch_up(audio);
    }, 15_000);
}

let music_player: HTMLAudioElement | null = null;

function get_music_player() {
    if (!music_player) {
        music_player = new Audio();
        music_player.loop = true;
        route_audio(music_player);
        keep_unlocked(music_player);
        keep_in_step(music_player);
    }
    return music_player;
}

const effect_players: HTMLAudioElement[] = [];

/** One that plays no effect right now, a new one if all do */
function free_effect_player() {
    const busy = new Set([...effects.values()].flatMap((playing) => [...playing]));
    let audio = effect_players.find((player) => !busy.has(player));
    if (!audio) {
        audio = new Audio();
        route_audio(audio);
        keep_unlocked(audio);
        effect_players.push(audio);
    }
    return audio;
}

// Ready before the first tap, so it unlocks them
if (typeof document !== "undefined") {
    get_music_player();
    for (let i = 0; i < 3; i++) free_effect_player();
}

let told_to_tap = false;

/** iOS plays sound only after a tap, then the next tap starts it */
function play_or_wait(audio: HTMLAudioElement) {
    wake_audio();
    audio.play().catch((e) => {
        console.error("Playing music failed", e);
        if (e?.name === "NotAllowedError" && !told_to_tap) {
            told_to_tap = true;
            notify(
                "Tipp kurz irgendwo hin, dann hörst du die Musik",
                MessageTypes.Info,
                5000,
            );
        }
        document.addEventListener(
            "pointerdown",
            () => {
                if (audio !== music || !audio.paused) return;
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
        if (music.paused && !document.hidden) play_or_wait(music);
        return;
    }
    const player = get_music_player();
    player.src = asset_url(file);
    set_audio_level(player, 0);
    music = player;
    audioState.music = { name, file, started_at };
    play_or_wait(player);
    // Slowly, music coming in at once is a jump scare
    fade(player, playing_music_volume, undefined, 3000);
}

// Phones and tablets pause the music while the app is in the background, and play on
// where everyone else is when it comes back. The desktop keeps playing in other windows.
if (typeof document !== "undefined" && !in_tauri && navigator.maxTouchPoints > 0) {
    document.addEventListener("visibilitychange", () => {
        if (!music || !audioState.music) return;
        if (document.hidden) music.pause();
        else play_or_wait(music);
    });
}

export function stop_music() {
    if (music) {
        const old = music;
        music = null;
        // Unless the next song already plays on it
        fade(old, () => 0, () => {
            if (old !== music) old.pause();
        });
    }
    audioState.music = null;
}

/** Loudness below 1 plays it quieter than the effect volume, e.g. a distant thunder */
export function play_effect(name: string, file: string, loudness = 1) {
    const audio = free_effect_player();
    clearInterval(fades.get(audio));
    audio.src = asset_url(file);
    set_audio_level(audio, effect_volume() * loudness);
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
