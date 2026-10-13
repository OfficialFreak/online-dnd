import { asset_url } from "./assets";
import { in_tauri } from "./platform";
import type { TabletopTrack } from "./sound-library";
import { appState, ensureStore } from "./state.svelte";
import { MessageTypes, notify } from "./notifications.svelte";

/** Music or a sound effect the DM can play for everyone */
export type Sound = {
    name: string;
    file: string;
    /**
     * Music loops until the DM stops it, a new song replaces it. Ambience loops alongside,
     * like rain, as many as the DM likes. An effect plays once.
     */
    kind: "music" | "ambience" | "effect";
    /** How loud it plays relative to the others, from 0 to 1 */
    level?: number;
};

/** A song or ambience playing for everyone */
export type Playing = {
    name: string;
    file: string;
    started_at: number;
    /** How loud relative to the others, from 0 to 1, the DM sets it */
    level: number;
};

export const audioState = $state({
    // Silent until load_volume() brings the ones saved on this device: music that began
    // before that blared for a moment for someone who had turned it off
    music_volume: 0,
    effect_volume: 0,
    muted: false,
    /** The song playing for everyone right now */
    music: null as Playing | null,
    /** The ambience playing alongside, like rain */
    ambience: [] as Playing[],
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
/** While the microphone records nothing plays, see hold_sound() */
let held = false;
/** An effect the DM plays again before it ends plays twice at once */
const effects = new Map<string, Set<HTMLAudioElement>>();
/** The players of the ambience playing, by the sound's name */
const ambience = new Map<string, HTMLAudioElement>();

/** Whether this player loops music or ambience for everyone right now */
function is_live(audio: HTMLAudioElement) {
    return audio === music || [...ambience.values()].includes(audio);
}

/** The song's player and the ambience's, each with how loud it should play */
function live_players(): [HTMLAudioElement, () => number][] {
    const live: [HTMLAudioElement, () => number][] = [];
    if (music && audioState.music) live.push([music, playing_music_volume]);
    for (const [name, player] of ambience) live.push([player, () => ambience_volume(name)]);
    return live;
}

export function music_volume() {
    return audioState.muted || held ? 0 : audioState.music_volume;
}

/**
 * The loudest the music gets. Songs are mastered loud and the voices in the call should
 * stay above them, the slider used to be useful only in its lowest fifth.
 */
export const MAX_MUSIC_VOLUME = 0.3;

/**
 * Where the music slider stands for a volume, from 0 to 1. Squared, as the ear hears
 * loudness: the lower half of the slider covers the quiet levels finely.
 */
export function music_slider(volume: number) {
    return Math.sqrt(Math.min(1, Math.max(0, volume) / MAX_MUSIC_VOLUME));
}

/** The volume of the music slider standing there */
export function music_volume_at(slider: number) {
    return MAX_MUSIC_VOLUME * slider * slider;
}

export function effect_volume() {
    return audioState.muted || held ? 0 : audioState.effect_volume;
}

function playing_music_volume() {
    return ducked ? 0 : music_volume() * (audioState.music?.level ?? 1);
}

/** Pressure leaves the ambience on, it only takes the place of the song */
function ambience_volume(name: string) {
    const playing = audioState.ambience.find((playing) => playing.name === name);
    return music_volume() * (playing?.level ?? 1);
}

// The app plays music, as a music app: iOS mutes Web Audio with the switch on its side,
// which left the music silent while it played. Safari 17 and later.
if (typeof navigator !== "undefined" && "audioSession" in navigator) {
    try {
        (navigator as Navigator & { audioSession: { type: string } }).audioSession.type =
            "playback";
    } catch (e) {
        console.warn("The audio session can't be set", e);
    }
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
            // A larger buffer than for quick effects: music has time, and on a busy
            // iPhone, e.g. while zooming the map, the small one ran dry and crackled
            context = new AudioContext({ latencyHint: "playback" });
            // It starts halted without a tap, and iOS halts it in the background
            // iOS lets a touch start sound only once it lifts
            for (const type of ["pointerdown", "touchend", "click", "visibilitychange"]) {
                document.addEventListener(type, wake_audio);
            }
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
    if (gain) {
        // Glides there within a few hundredths of a second: set at once, every step of a
        // fade clicked
        const now = gain.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(value, now, 0.015);
    } else {
        audio.volume = value;
    }
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
    for (const type of ["pointerdown", "touchend", "click", "keydown"]) {
        document.addEventListener(type, unlock, true);
    }
}

function unlock() {
    wake_audio();
    for (const audio of players) {
        if (unlocked.has(audio)) continue;
        unlocked.add(audio);
        // Refused, e.g. as the finger only came down, it tries again when it lifts
        const retry = () => unlocked.delete(audio);
        // A song waiting for this tap plays, the others play a moment of silence
        if (is_live(audio)) {
            audio.play().catch(retry);
            continue;
        }
        audio.src = SILENCE;
        audio
            .play()
            .then(() => {
                if (audio.src === SILENCE) audio.pause();
            })
            .catch(retry);
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
 * How far each song or ambience was when the server sent it, by the server's clock, and
 * when that arrived here. The clocks of phones and computers may be off by seconds.
 */
const clocks = new WeakMap<HTMLAudioElement, { elapsed: number; received: number }>();

/** started_at and sent_at by the server's clock, older servers send no sent_at */
function clock_from(started_at: number, sent_at?: number) {
    return { elapsed: (sent_at ?? Date.now()) - started_at, received: performance.now() };
}

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
    const clock = clocks.get(audio);
    if (length === null || !clock) return null;
    const seconds = (clock.elapsed + performance.now() - clock.received) / 1000;
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
        if (!is_live(audio) || corrections >= 3) return;
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
        if (!is_live(audio) || audio.paused) return;
        const position = song_position(audio);
        if (position !== null && drift(audio, position) > 1) catch_up(audio);
    }, 15_000);
}

/** Two take turns, so the next song fades in while the last one fades out */
const music_players: HTMLAudioElement[] = [];

/** The player that isn't playing the music, a silent one before one still fading out */
function get_music_player() {
    while (music_players.length < 2) {
        const player = new Audio();
        player.loop = true;
        route_audio(player);
        keep_unlocked(player);
        keep_in_step(player);
        music_players.push(player);
    }
    const free = music_players.filter((player) => player !== music);
    return free.find((player) => player.paused) ?? free[0] ?? music_players[0];
}

/** Players for the ambience, reused like the others so the first tap unlocks them */
const loop_players: HTMLAudioElement[] = [];

function new_loop_player() {
    const player = new Audio();
    player.loop = true;
    route_audio(player);
    keep_unlocked(player);
    keep_in_step(player);
    loop_players.push(player);
    return player;
}

/** One that plays no ambience and has faded out, a new one if all do */
function free_loop_player() {
    const busy = new Set(ambience.values());
    return (
        loop_players.find((player) => !busy.has(player) && player.paused) ??
        new_loop_player()
    );
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
    for (let i = 0; i < 3; i++) new_loop_player();
}

let told_to_tap = false;

/**
 * Whether the browser plays no sound before a tap or click, as on iPhones: a moment of
 * silence it refuses to play tells
 */
export async function sound_needs_tap() {
    if (typeof Audio === "undefined") return false;
    const probe = new Audio(SILENCE);
    const answer = probe.play().then(
        () => {
            probe.pause();
            return false;
        },
        (e) => (e as Error)?.name === "NotAllowedError",
    );
    // Without an answer the app opens anyway
    const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500));
    return Promise.race([answer, late]);
}

/** The opening asks for the tap itself, the music needn't ask for one too */
export function tap_asked() {
    told_to_tap = true;
}

/** iOS plays sound only after a tap, then the next tap starts it */
function play_or_wait(audio: HTMLAudioElement) {
    // Comes back when the recording ends
    if (held) return;
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
                if (!is_live(audio) || !audio.paused || held) return;
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
    level = 1,
) {
    const clock = clock_from(started_at, sent_at);
    // The same song again, after connecting anew, plays on instead of starting over
    if (
        music &&
        audioState.music?.file === file &&
        audioState.music.started_at === started_at
    ) {
        clocks.set(music, clock);
        set_sound_level(name, level);
        if (music.paused && !document.hidden) play_or_wait(music);
        return;
    }
    const old = music;
    const player = get_music_player();
    player.src = asset_url(file);
    set_audio_level(player, 0);
    clocks.set(player, clock);
    music = player;
    audioState.music = { name, file, started_at, level };
    play_or_wait(player);
    // Slowly, music coming in at once is a jump scare
    fade(player, playing_music_volume, undefined, 3000);
    // The last song fades out underneath instead of breaking off, e.g. on a new scene
    if (old) {
        fade(old, () => 0, () => {
            if (old !== music) old.pause();
        }, 2000);
    }
}

// Phones and tablets pause the music while the app is in the background, and play on
// where everyone else is when it comes back. The desktop keeps playing in other windows.
if (typeof document !== "undefined" && !in_tauri && navigator.maxTouchPoints > 0) {
    document.addEventListener("visibilitychange", () => {
        for (const [player] of live_players()) {
            if (document.hidden) player.pause();
            else play_or_wait(player);
        }
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

/**
 * Ambience loops alongside the song, as many as the DM plays. Played again it starts
 * over, after connecting anew the same one plays on.
 */
export function play_ambience(
    name: string,
    file: string,
    started_at: number,
    sent_at?: number,
    level = 1,
) {
    const clock = clock_from(started_at, sent_at);
    const known = audioState.ambience.find((playing) => playing.name === name);
    const current = ambience.get(name);
    if (current && known?.file === file && known.started_at === started_at) {
        clocks.set(current, clock);
        set_sound_level(name, level);
        if (current.paused && !document.hidden) play_or_wait(current);
        return;
    }
    const player = free_loop_player();
    player.src = asset_url(file);
    set_audio_level(player, 0);
    clocks.set(player, clock);
    ambience.set(name, player);
    const playing = { name, file, started_at, level };
    audioState.ambience = known
        ? audioState.ambience.map((other) => (other.name === name ? playing : other))
        : [...audioState.ambience, playing];
    play_or_wait(player);
    fade(player, () => ambience_volume(name), undefined, 3000);
    if (current) fade_out(current, 2000);
}

/** Fades a song or ambience out and pauses it, unless it plays something new by then */
function fade_out(player: HTMLAudioElement, duration = 1200) {
    fade(player, () => 0, () => {
        if (!is_live(player)) player.pause();
    }, duration);
}

export function stop_ambience(name: string) {
    const player = ambience.get(name);
    ambience.delete(name);
    audioState.ambience = audioState.ambience.filter((playing) => playing.name !== name);
    if (player) fade_out(player, 2000);
}

/** The DM made a sound louder or quieter relative to the others */
export function set_sound_level(name: string, level: number) {
    if (audioState.music?.name === name) {
        audioState.music.level = level;
        // A fade going on reads the new level itself
        if (music && !fades.has(music)) set_audio_level(music, playing_music_volume());
    }
    const playing = audioState.ambience.find((playing) => playing.name === name);
    const player = ambience.get(name);
    if (playing) playing.level = level;
    if (player && !fades.has(player)) set_audio_level(player, ambience_volume(name));
    const sound = audioState.sounds.find((sound) => sound.name === name);
    if (sound) sound.level = level;
}

/** Loudness below 1 plays it quieter than the effect volume, e.g. a distant thunder */
export function play_effect(name: string, file: string, loudness = 1) {
    if (held) return;
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

/**
 * Silences everything before the microphone records: nothing of it ends up in the
 * recording, and iOS switches its audio over for the microphone and stuttered with sound
 * still playing. The music fades out and pauses, the effects end, new ones stay silent.
 * Resolves once it is quiet.
 */
export function hold_sound() {
    held = true;
    for (const [player] of live_players()) {
        if (player.paused) continue;
        fade(player, () => 0, () => {
            if (held) player.pause();
        }, HOLD_FADE);
    }
    for (const [name, playing] of [...effects]) {
        for (const audio of playing) {
            forget_effect(name, audio);
            fade(audio, () => 0, () => audio.pause(), HOLD_FADE);
        }
    }
    return new Promise<void>((resolve) => setTimeout(resolve, HOLD_FADE + 50));
}

const HOLD_FADE = 300;

/**
 * After recording the music comes back where everyone else is, slowly. A moment later:
 * iOS switches its audio back first.
 */
export function release_sound() {
    if (!held) return;
    held = false;
    setTimeout(() => {
        wake_audio();
        if (held || document.hidden) return;
        for (const [player, volume] of live_players()) {
            set_audio_level(player, 0);
            // Once it plays it catches up with the others, see keep_in_step()
            play_or_wait(player);
            fade(player, volume, undefined, 1500);
        }
    }, 150);
}

export function stop_all_sounds() {
    stop_music();
    for (const name of [...ambience.keys()]) stop_ambience(name);
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
    for (const [player, volume] of live_players()) set_audio_level(player, volume());
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

/** Without saved ones: quiet, louder ones startled when the music came in */
const DEFAULT_VOLUME = { music_volume: 0.15, effect_volume: 0.5 };

export async function load_volume() {
    let saved: unknown;
    try {
        await ensureStore();
        saved = await appState.store.get("audio");
    } catch (e) {
        console.error("Loading the volume failed", e);
    }
    Object.assign(audioState, DEFAULT_VOLUME, saved);
    // Saved before the music got quieter at most
    audioState.music_volume = Math.min(MAX_MUSIC_VOLUME, audioState.music_volume);
    // What already plays comes up to it
    for (const [player, volume] of live_players()) fade(player, volume);
    for (const playing of effects.values()) {
        for (const audio of playing) set_audio_level(audio, effect_volume());
    }
}
