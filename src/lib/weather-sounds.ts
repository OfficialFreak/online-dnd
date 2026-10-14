/**
 * The sounds of the weather's moments, made on the spot with Web Audio like the dice in
 * sfx.ts: coins clinking on the map and the rumble of a quake with stones crumbling.
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

function output(ctx: AudioContext, loudness: number) {
    const gain = ctx.createGain();
    gain.gain.value = effect_volume() * loudness;
    gain.connect(ctx.destination);
    return gain;
}

function white_noise(ctx: AudioContext) {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
}

/** Not more than this many clinks a second, a shower of coins would be a hiss */
let last_clink = 0;

/**
 * A coin landing: a short bright ring of a few partials that don't fit together, like
 * metal, and a tick at its start
 */
export function play_clink(loudness = 1) {
    const ctx = audio();
    if (!ctx || !effect_volume() || performance.now() - last_clink < 55) return;
    last_clink = performance.now();
    const out = output(ctx, 0.35 * loudness);
    const at = ctx.currentTime + 0.005;
    const base = 1900 + Math.random() * 900;
    for (const [ratio, strength, decay] of [
        [1, 1, 0.22],
        [2.76, 0.55, 0.12],
        [5.4, 0.3, 0.07],
    ]) {
        const tone = ctx.createOscillator();
        tone.frequency.value = base * ratio;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(strength, at + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        tone.connect(gain).connect(out);
        tone.start(at);
        tone.stop(at + decay + 0.02);
    }
    const tick = ctx.createBufferSource();
    tick.buffer = white_noise(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "highpass";
    band.frequency.value = 5000;
    const tick_gain = ctx.createGain();
    tick_gain.gain.setValueAtTime(0.5, at);
    tick_gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);
    tick.connect(band).connect(tick_gain).connect(out);
    tick.start(at, Math.random(), 0.03);
}

/**
 * A quake: a deep rumble swelling up and dying away over `seconds`, with stones knocking
 * and crumbling now and then
 */
export function play_rumble(seconds = 2.8) {
    const ctx = audio();
    if (!ctx || !effect_volume()) return;
    const out = output(ctx, 1);
    const at = ctx.currentTime + 0.02;
    const end = at + seconds;

    // Deep noise, swelling unevenly
    const rumble = ctx.createBufferSource();
    rumble.buffer = white_noise(ctx);
    rumble.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 110;
    low.Q.value = 0.9;
    const lower = ctx.createBiquadFilter();
    lower.type = "lowpass";
    lower.frequency.value = 160;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(2.6, at + 0.25);
    for (let t = at + 0.4; t < end - 1; t += 0.3) {
        gain.gain.linearRampToValueAtTime(1.6 + Math.random() * 1.4, t);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    rumble.connect(low).connect(lower).connect(gain).connect(out);
    rumble.start(at, Math.random());
    rumble.stop(end + 0.05);

    // Stones knocking and grit trickling, more at first
    const stones = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < stones; i++) {
        const when = at + (Math.random() ** 1.6) * (seconds - 0.4);
        const stone = ctx.createBufferSource();
        stone.buffer = white_noise(ctx);
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 500 + Math.random() * 1400;
        band.Q.value = 2 + Math.random() * 3;
        const knock = ctx.createGain();
        const strength = 0.25 + Math.random() * 0.5;
        knock.gain.setValueAtTime(0.0001, when);
        knock.gain.exponentialRampToValueAtTime(strength, when + 0.004);
        knock.gain.exponentialRampToValueAtTime(0.0001, when + 0.06 + Math.random() * 0.12);
        stone.connect(band).connect(knock).connect(out);
        stone.start(when, Math.random() * 1.5, 0.2);
    }
}
