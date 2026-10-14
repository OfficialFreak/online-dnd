/**
 * The sounds of the weather's moments, made on the spot with Web Audio like the dice in
 * sfx.ts: coins landing on the map and the rumble of a quake with stones crumbling.
 */
import { effect_volume } from "$lib/audio.svelte";
import { quake_strength, seeded } from "$lib/weather-common";

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let coins: AudioBuffer[] = [];

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

/** How a thin metal disc rings: its partials, above the lowest, which never fit together */
const COIN_MODES = [1, 1.47, 2.09, 2.56, 2.98, 3.6, 4.15, 4.9, 5.7];

/**
 * A coin dropped on a hard edge, worked out sample by sample: it hits, bounces a few
 * times quicker and softer and settles. Each hit is a sharp tick and the disc ringing in
 * its partials, the high ones dying first. A few of them differ in size and bounce.
 */
function coin_buffer(ctx: AudioContext, seed: number) {
    const next = seeded(seed);
    const rate = ctx.sampleRate;
    const data = new Float32Array(Math.floor(rate * 0.8));
    const base = 2300 + next() * 1700;
    const modes = COIN_MODES.map((ratio, i) => ({
        frequency: base * ratio * (0.97 + next() * 0.06),
        strength: (0.35 + next() * 0.65) / (1 + i * 0.35),
        // Seconds to die down to a third, lower ones ring longer
        decay: (0.32 - i * 0.028) * (0.6 + next() * 0.6),
    })).filter((mode) => mode.frequency < rate * 0.45);

    // The bounces, closer together and softer each time
    const hits: { at: number; strength: number }[] = [];
    let at = 0.004;
    let gap = 0.05 + next() * 0.05;
    let strength = 1;
    const bounces = 2 + Math.floor(next() * 3);
    for (let i = 0; i < bounces; i++) {
        hits.push({ at, strength });
        at += gap;
        gap *= 0.55 + next() * 0.15;
        strength *= 0.35 + next() * 0.25;
    }

    for (const hit of hits) {
        const start = Math.floor(hit.at * rate);
        // Where the disc is struck changes which partials sound most
        const struck = modes.map((mode) => mode.strength * (0.4 + next() * 0.6));
        for (let m = 0; m < modes.length; m++) {
            const { frequency, decay } = modes[m];
            const step = (2 * Math.PI * frequency) / rate;
            const fade = Math.exp(-1 / (decay * hit.strength ** 0.3 * rate));
            const phase = next() * Math.PI * 2;
            let amplitude = struck[m] * hit.strength;
            // A sine turned on by one step each sample, without Math.sin for each
            const turn = 2 * Math.cos(step);
            let before = Math.sin(phase - step);
            let earlier = Math.sin(phase - 2 * step);
            for (let i = start; i < data.length && amplitude > 1e-4; i++) {
                const value = turn * before - earlier;
                earlier = before;
                before = value;
                data[i] += amplitude * value;
                amplitude *= fade;
            }
        }
        // The tick of metal on stone, bright and gone in a few milliseconds
        const tick = Math.floor(0.004 * rate);
        let last = 0;
        for (let i = 0; i < tick && start + i < data.length; i++) {
            const white = Math.random() * 2 - 1;
            data[start + i] += (white - last) * 0.6 * hit.strength * (1 - i / tick) ** 2;
            last = white;
        }
    }

    let peak = 0;
    for (const value of data) peak = Math.max(peak, Math.abs(value));
    const buffer = ctx.createBuffer(1, data.length, rate);
    buffer.getChannelData(0).set(data.map((value) => (value / peak) * 0.85));
    return buffer;
}

/** Not more than this many coins heard a second, a shower would be a hiss */
let last_clink = 0;

/** Works out the coins' sounds before the first lands, when gold starts to rain */
export function prepare_clinks() {
    const ctx = audio();
    if (ctx && !coins.length) coins = Array.from({ length: 8 }, (_, i) => coin_buffer(ctx, i * 977 + 31));
}

/** A coin landing on the map, `loudness` by how hard */
export function play_clink(loudness = 1) {
    const ctx = audio();
    if (!ctx || !effect_volume() || performance.now() - last_clink < 40) return;
    last_clink = performance.now();
    prepare_clinks();
    const coin = ctx.createBufferSource();
    coin.buffer = coins[Math.floor(Math.random() * coins.length)];
    // Smaller and larger coins
    coin.playbackRate.value = 0.88 + Math.random() * 0.26;
    coin.connect(output(ctx, 0.3 * (0.4 + 0.6 * loudness)));
    coin.start(ctx.currentTime + Math.random() * 0.01);
}

/**
 * A quake: a deep rumble over `seconds` that jolts hard at first, dies down and jolts
 * once more, with stones knocking and grit crumbling all along
 */
export function play_rumble(seconds = 4.4) {
    const ctx = audio();
    if (!ctx || !effect_volume()) return;
    const out = output(ctx, 1);
    const at = ctx.currentTime + 0.02;
    const end = at + seconds;

    // Deep noise, swelling with the jolts, see QUAKE in weather-moments.ts
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
    gain.gain.exponentialRampToValueAtTime(2.8, at + 0.2);
    for (let t = at + 0.35; t < end - 0.8; t += 0.25) {
        const jolt = quake_strength((t - at) / seconds);
        gain.gain.linearRampToValueAtTime(0.4 + jolt * (1.8 + Math.random() * 1.2), t);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    rumble.connect(low).connect(lower).connect(gain).connect(out);
    rumble.start(at, Math.random());
    rumble.stop(end + 0.05);

    // Stones knocking and grit trickling, more while it jolts
    const stones = 22 + Math.floor(Math.random() * 10);
    for (let i = 0; i < stones; i++) {
        let when = at + Math.random() * (seconds - 0.4);
        // Thinned out where it shakes less
        if (Math.random() > quake_strength((when - at) / seconds) + 0.2) when = at + Math.random() * 1.2;
        const stone = ctx.createBufferSource();
        stone.buffer = white_noise(ctx);
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 400 + Math.random() * 1600;
        band.Q.value = 2 + Math.random() * 4;
        const knock = ctx.createGain();
        const strength = 0.2 + Math.random() * 0.55;
        knock.gain.setValueAtTime(0.0001, when);
        knock.gain.exponentialRampToValueAtTime(strength, when + 0.004);
        knock.gain.exponentialRampToValueAtTime(0.0001, when + 0.05 + Math.random() * 0.15);
        stone.connect(band).connect(knock).connect(out);
        stone.start(when, Math.random() * 1.5, 0.25);
    }
}
