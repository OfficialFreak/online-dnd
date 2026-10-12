/**
 * Short sounds made on the spot with Web Audio, no files needed: dice tumbling behind the
 * DM's screen and the reactions of players who didn't record their own voice. And the
 * recording of a player's voice for their reactions.
 */
import { effect_volume } from "$lib/audio.svelte";

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** Started by the first tap or key, browsers keep sound off until then */
function audio() {
    if (typeof AudioContext === "undefined") return null;
    if (!context) {
        context = new AudioContext();
        const wake = () => {
            if (context?.state !== "running") context?.resume().catch(() => {});
        };
        document.addEventListener("pointerdown", wake, true);
        document.addEventListener("keydown", wake, true);
    }
    if (context.state !== "running") context.resume().catch(() => {});
    return context;
}

function output(ctx: AudioContext, loudness = 1) {
    const gain = ctx.createGain();
    gain.gain.value = effect_volume() * loudness;
    gain.connect(ctx.destination);
    return gain;
}

function white_noise(ctx: AudioContext) {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
}

/** One die hitting the table: a short bright click, sometimes with a dull knock */
function hit(ctx: AudioContext, out: AudioNode, at: number, strength: number) {
    const click = ctx.createBufferSource();
    click.buffer = white_noise(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1800 + Math.random() * 2800;
    band.Q.value = 5 + Math.random() * 4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(strength, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.045 + Math.random() * 0.03);
    click.connect(band).connect(gain).connect(out);
    click.start(at, Math.random() * 0.8, 0.09);
    if (Math.random() < 0.4) {
        const knock = ctx.createBufferSource();
        knock.buffer = white_noise(ctx);
        const low = ctx.createBiquadFilter();
        low.type = "lowpass";
        low.frequency.value = 260;
        const knock_gain = ctx.createGain();
        knock_gain.gain.setValueAtTime(0.0001, at);
        knock_gain.gain.exponentialRampToValueAtTime(strength * 1.6, at + 0.004);
        knock_gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
        knock.connect(low).connect(knock_gain).connect(out);
        knock.start(at, Math.random() * 0.8, 0.1);
    }
}

/** Dice tumbling over a table, the hits come faster and softer as they settle */
export function play_clatter() {
    const ctx = audio();
    if (!ctx || !effect_volume()) return;
    const out = output(ctx, 0.9);
    const dice = 1 + Math.floor(Math.random() * 2);
    for (let die = 0; die < dice; die++) {
        let at = ctx.currentTime + 0.02 + die * (0.03 + Math.random() * 0.05);
        let gap = 0.12 + Math.random() * 0.04;
        const hits = 8 + Math.floor(Math.random() * 5);
        for (let i = 0; i < hits; i++) {
            const strength = Math.max(0.12, 1 - i / hits) * (0.5 + Math.random() * 0.5);
            hit(ctx, out, at, strength);
            at += gap * (0.6 + Math.random() * 0.7);
            gap *= 0.84;
        }
    }
}

/** Where the mouth shapes the sound, the first two formants of some vowels */
const VOWELS = {
    a: [800, 1250],
    o: [500, 900],
    i: [320, 2300],
    e: [500, 1850],
    u: [350, 800],
} as const;

type Syllable = {
    /** Pitch at its start and end, in hertz */
    from: number;
    to: number;
    /** When it starts after the first and how long it lasts, in seconds */
    start: number;
    length: number;
    vowel: keyof typeof VOWELS;
    /** Wobble of the pitch, for a wail */
    vibrato?: number;
};

/** A cartoon voice saying something, like the characters of a party game */
function say(syllables: Syllable[]) {
    const ctx = audio();
    if (!ctx || !effect_volume()) return;
    const out = output(ctx, 0.5);
    const begin = ctx.currentTime + 0.02;
    for (const syllable of syllables) {
        const at = begin + syllable.start;
        const end = at + syllable.length;
        const voice = ctx.createOscillator();
        voice.type = "sawtooth";
        voice.frequency.setValueAtTime(syllable.from, at);
        voice.frequency.exponentialRampToValueAtTime(syllable.to, end);
        if (syllable.vibrato) {
            const wobble = ctx.createOscillator();
            wobble.frequency.value = 7;
            const depth = ctx.createGain();
            depth.gain.value = syllable.vibrato;
            wobble.connect(depth).connect(voice.frequency);
            wobble.start(at);
            wobble.stop(end);
        }
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0.0001, at);
        envelope.gain.exponentialRampToValueAtTime(1, at + 0.025);
        envelope.gain.setValueAtTime(1, Math.max(at + 0.03, end - 0.06));
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        for (const [i, frequency] of VOWELS[syllable.vowel].entries()) {
            const formant = ctx.createBiquadFilter();
            formant.type = "bandpass";
            formant.frequency.value = frequency;
            formant.Q.value = 6;
            const level = ctx.createGain();
            level.gain.value = i === 0 ? 1.4 : 0.8;
            voice.connect(formant).connect(level).connect(envelope);
        }
        envelope.connect(out);
        voice.start(at);
        voice.stop(end + 0.02);
    }
}

/** What a reaction sounds like when the player recorded none */
export const DEFAULT_VOICES: Record<string, () => void> = {
    hello: () =>
        say([
            { from: 300, to: 290, start: 0, length: 0.16, vowel: "a" },
            { from: 330, to: 420, start: 0.17, length: 0.32, vowel: "o" },
        ]),
    no: () => say([{ from: 330, to: 200, start: 0, length: 0.42, vowel: "a" }]),
    yippie: () =>
        say([
            { from: 520, to: 600, start: 0, length: 0.12, vowel: "i" },
            { from: 640, to: 900, start: 0.15, length: 0.32, vowel: "i" },
        ]),
    waah: () =>
        say([
            { from: 440, to: 170, start: 0, length: 1.0, vowel: "a", vibrato: 18 },
        ]),
};

/**
 * Records the microphone until stopped, at most for `seconds`. Gives a WAV file, quiet
 * at the start and end cut off and as loud as it can be without distorting.
 */
export async function record(seconds = 3) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
    });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    // Silent, but browsers only run the processor when it leads somewhere
    processor.connect(ctx.destination);

    let done: ((wav: Uint8Array | null) => void) | null = null;
    const result = new Promise<Uint8Array | null>((resolve) => (done = resolve));
    const stop = () => {
        if (!done) return result;
        const finish = done;
        done = null;
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        const rate = ctx.sampleRate;
        ctx.close().catch(() => {});
        finish(to_wav(chunks, rate));
        return result;
    };
    const timer = setTimeout(stop, seconds * 1000);
    return {
        stop: () => {
            clearTimeout(timer);
            return stop();
        },
        result,
    };
}

function to_wav(chunks: Float32Array[], rate: number): Uint8Array | null {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
    }
    // Cut the silence before and after, keeping a moment
    const loud = (x: number) => Math.abs(x) > 0.03;
    let first = samples.findIndex(loud);
    if (first === -1) return null;
    let last = samples.length - 1;
    while (last > first && !loud(samples[last])) last--;
    const pad = Math.round(rate * 0.05);
    first = Math.max(0, first - pad);
    last = Math.min(samples.length - 1, last + pad);
    const voice = samples.subarray(first, last + 1);

    // 22 kHz is plenty for a voice and halves the file
    const target = 22050;
    const ratio = rate / target;
    const out_length = Math.floor(voice.length / ratio);
    const resampled = new Float32Array(out_length);
    for (let i = 0; i < out_length; i++) {
        const position = i * ratio;
        const index = Math.floor(position);
        const next = Math.min(voice.length - 1, index + 1);
        resampled[i] = voice[index] + (voice[next] - voice[index]) * (position - index);
    }
    const peak = resampled.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
    const gain = peak > 0 ? Math.min(4, 0.95 / peak) : 1;

    const buffer = new ArrayBuffer(44 + out_length * 2);
    const view = new DataView(buffer);
    const text = (at: number, value: string) =>
        [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, 36 + out_length * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, target, true);
    view.setUint32(28, target * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, out_length * 2, true);
    for (let i = 0; i < out_length; i++) {
        const x = Math.max(-1, Math.min(1, resampled[i] * gain));
        view.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return new Uint8Array(buffer);
}
