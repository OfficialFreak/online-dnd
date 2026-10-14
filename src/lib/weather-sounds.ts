/**
 * The sounds of the weather's moments, made on the spot with Web Audio like the dice in
 * sfx.ts: coins landing on the map and a quake, the ground roaring deep, rock groaning,
 * stones tumbling and gravel shifting.
 */
import { effect_volume } from "$lib/audio.svelte";
import { audio } from "$lib/sfx";
import { quake_strength } from "$lib/weather-common";

/** Rounds off the loudest moments, quieter sounds pass about as they are */
let soft: Float32Array | null = null;

function soft_limit(ctx: AudioContext) {
    if (!soft) {
        soft = new Float32Array(2048);
        for (let i = 0; i < soft.length; i++) {
            const x = (i / (soft.length - 1)) * 2 - 1;
            soft[i] = Math.tanh(2.5 * x) / Math.tanh(2.5);
        }
    }
    const into = ctx.createGain();
    into.gain.value = 0.42;
    const limit = ctx.createWaveShaper();
    limit.curve = soft;
    limit.oversample = "4x";
    into.connect(limit);
    return { into, out: limit };
}

function output(ctx: AudioContext, loudness: number) {
    const gain = ctx.createGain();
    gain.gain.value = effect_volume() * loudness;
    gain.connect(ctx.destination);
    return gain;
}

// ------------------------------------------------------------------------------ Coins

/**
 * How a coin rings, as ratios to its lowest partial: the modes of a thin disc, which never
 * fit together as a tone does. Each sounds twice, a hair apart, as no coin is perfectly
 * round, and the two shimmer against each other.
 */
const DISC = [1, 1.73, 2.33, 3.91, 4.11, 6.3, 6.9, 8.7];

type Ring = { frequency: number; strength: number; decay: number };

/** The partials of one coin: its size sets the lowest, how it is struck the rest */
function coin_rings(rate: number, base: number, ring: number): Ring[] {
    const rings: Ring[] = [];
    DISC.forEach((ratio, i) => {
        for (const split of [-1, 1]) {
            const frequency = base * ratio * (1 + split * (0.002 + Math.random() * 0.006));
            if (frequency > rate * 0.45) continue;
            rings.push({
                frequency,
                strength: (0.5 + Math.random() * 0.5) / (1 + i * 0.35),
                // To a third in this many seconds, the high ones die first
                decay: ring * (1 - i * 0.07) * (0.7 + Math.random() * 0.6),
            });
        }
    });
    return rings;
}

/** Adds a coin ringing from `start`, `damp` shortens it as the coin lies against stone */
function add_ring(data: Float32Array, rate: number, start: number, rings: Ring[], strength: number, damp = 1) {
    for (const { frequency, strength: part, decay } of rings) {
        const step = (2 * Math.PI * frequency) / rate;
        const fade = Math.exp(-1 / (decay * damp * rate));
        const phase = Math.random() * Math.PI * 2;
        // Struck somewhere else each time, other partials sound most
        let amplitude = part * strength * (0.3 + Math.random() * 0.7);
        // A sine turned on by one step each sample, without Math.sin for each
        const turn = 2 * Math.cos(step);
        let before = Math.sin(phase - step);
        let earlier = Math.sin(phase - 2 * step);
        for (let i = start; i < data.length && amplitude > 2e-4; i++) {
            const value = turn * before - earlier;
            earlier = before;
            before = value;
            data[i] += amplitude * value;
            amplitude *= fade;
        }
    }
}

/**
 * The hard "chk" of metal meeting stone: a burst of bright noise gone in a millisecond or
 * two, over a short dull knock of the coin's weight
 */
function add_tick(data: Float32Array, rate: number, start: number, strength: number) {
    const length = Math.floor(rate * (0.0008 + Math.random() * 0.0012));
    let last = 0;
    for (let i = 0; i < length && start + i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        // The difference of two samples keeps only the brightest of the noise
        data[start + i] += (white - last) * 0.4 * strength * (1 - i / length) ** 1.5;
        last = white;
    }
    // Noise smoothed down to about a kilohertz and a half, for a few milliseconds
    const knock = Math.floor(rate * (0.003 + Math.random() * 0.003));
    const smooth = 1 - Math.exp((-2 * Math.PI * (1000 + Math.random() * 1000)) / rate);
    let dull = 0;
    for (let i = 0; i < knock && start + i < data.length; i++) {
        dull += smooth * (Math.random() * 2 - 1 - dull);
        data[start + i] += dull * 1.4 * strength * (1 - i / knock) ** 2;
    }
}

/**
 * One coin hitting the stone edge of the map, worked out sample by sample. Mostly it lands
 * flat and the stone damps its ring at once; on its rim it rings on. Now and then it hits
 * another coin too. With `settles` it wobbles to rest after, rattling ever faster and
 * softer like a coin spinning out on a table.
 */
function coin_buffer(ctx: AudioContext, settles: boolean) {
    const rate = ctx.sampleRate;
    const data = new Float32Array(Math.floor(rate * (settles ? 0.9 : 0.6)));
    const base = 2600 + Math.random() * 2600;
    const on_rim = Math.random() < 0.3;
    const rings = coin_rings(rate, base, on_rim ? 0.22 : 0.06);

    const hit = Math.floor(0.003 * rate);
    add_tick(data, rate, hit, 1);
    add_ring(data, rate, hit, rings, 1);

    // Against another coin: a second, brighter ring a moment later
    if (Math.random() < 0.25) {
        const other = coin_rings(rate, base * (1.1 + Math.random() * 0.3), 0.18);
        const at = hit + Math.floor(rate * (0.004 + Math.random() * 0.012));
        add_tick(data, rate, at, 0.5);
        add_ring(data, rate, at, other, 0.55);
    }

    if (settles) {
        // Each wobble a little quicker and softer, the stone damping the ring more
        let at = 0.05 + Math.random() * 0.04;
        let gap = 0.035 + Math.random() * 0.015;
        let strength = 0.35;
        const wobbles = 9 + Math.floor(Math.random() * 10);
        for (let i = 0; i < wobbles && at < 0.85; i++) {
            const start = Math.floor(at * rate);
            add_tick(data, rate, start, strength * 0.8);
            add_ring(data, rate, start, rings, strength, 0.35);
            at += gap;
            gap *= 0.8;
            strength *= 0.86;
        }
    }

    let peak = 0;
    for (const value of data) peak = Math.max(peak, Math.abs(value));
    const buffer = ctx.createBuffer(1, data.length, rate);
    buffer.getChannelData(0).set(data.map((value) => (value / peak) * 0.85));
    return buffer;
}

let hits: AudioBuffer[] = [];
let settling: AudioBuffer[] = [];

/** Not more than this many coins heard a second, a shower would be a hiss */
let last_clink = 0;

/** Works out the coins' sounds before the first lands, when gold starts to rain */
export function prepare_clinks() {
    const ctx = audio();
    if (!ctx || hits.length) return;
    hits = Array.from({ length: 12 }, () => coin_buffer(ctx, false));
    settling = Array.from({ length: 6 }, () => coin_buffer(ctx, true));
}

/**
 * A coin landing on the map, `loudness` by how hard. The soft ones are coins that bounced
 * already or fall short, half of them wobble to rest.
 */
export function play_clink(loudness = 1) {
    const ctx = audio();
    if (!ctx || !effect_volume() || performance.now() - last_clink < 40) return;
    last_clink = performance.now();
    prepare_clinks();
    const kinds = loudness < 0.55 && Math.random() < 0.5 ? settling : hits;
    const coin = ctx.createBufferSource();
    coin.buffer = kinds[Math.floor(Math.random() * kinds.length)];
    // Smaller and larger coins
    coin.playbackRate.value = 0.92 + Math.random() * 0.18;
    // Anywhere along the map's edge
    const place = ctx.createStereoPanner();
    place.pan.value = (Math.random() * 2 - 1) * 0.7;
    coin.connect(place).connect(output(ctx, 0.26 * (0.35 + 0.65 * loudness)));
    coin.start(ctx.currentTime + Math.random() * 0.01);
}

// ------------------------------------------------------------------------------ Quake

let brown: AudioBuffer | null = null;

/** Deep noise for the roar, made once */
function brown_noise(ctx: AudioContext) {
    if (brown && brown.sampleRate === ctx.sampleRate) return brown;
    brown = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
        const data = brown.getChannelData(channel);
        let last = 0;
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
            last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
            data[i] = last;
            peak = Math.max(peak, Math.abs(last));
        }
        for (let i = 0; i < data.length; i++) data[i] /= peak;
    }
    return brown;
}

/** Smooth wandering between 0 and 1, `speed` new values a second */
function wander(speed: number) {
    const points = Array.from({ length: 64 }, () => Math.random());
    return (t: number) => {
        const x = t * speed;
        const i = Math.floor(x) % 63;
        const f = x - Math.floor(x);
        const s = f * f * (3 - 2 * f);
        return points[i] + (points[i + 1] - points[i]) * s;
    };
}

/** A curve over `seconds` from a function of the time, for setValueCurveAtTime */
function over(seconds: number, value: (t: number) => number, per_second = 100) {
    const values = new Float32Array(Math.ceil(seconds * per_second) + 1);
    for (let i = 0; i < values.length; i++) values[i] = Math.max(0, value(i / per_second));
    return values;
}

/** A heavy jolt: a sine falling deep, saturated so small speakers hear its overtones */
function jolt(ctx: AudioContext, out: AudioNode, at: number, strength: number) {
    const tone = ctx.createOscillator();
    tone.frequency.setValueAtTime(75, at);
    tone.frequency.exponentialRampToValueAtTime(27, at + 0.35);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(strength, at + 0.008);
    env.gain.setTargetAtTime(0, at + 0.05, 0.6);
    const shaper = ctx.createWaveShaper();
    shaper.curve = soft;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 220;
    tone.connect(env).connect(shaper).connect(low).connect(out);
    tone.start(at);
    tone.stop(at + 6);
}

/**
 * Stones tumbling and gravel shifting, more while it shakes harder, worked out sample by
 * sample into two buffers: as separate nodes they were hundreds at once. The stones go
 * deep with the rumble, the gravel stays above it.
 */
function debris(ctx: AudioContext, seconds: number) {
    const rate = ctx.sampleRate;
    const length = Math.ceil(rate * (seconds + 0.6));
    const shaking = (t: number) => quake_strength(Math.min(t, seconds) / seconds);
    const make = () => [new Float32Array(length), new Float32Array(length)] as const;
    const add = (
        [left, right]: readonly [Float32Array, Float32Array],
        start: number,
        pan: number,
        sample: (i: number) => number,
        count: number,
    ) => {
        const l = Math.cos(((pan + 1) * Math.PI) / 4);
        const r = Math.sin(((pan + 1) * Math.PI) / 4);
        for (let i = 0; i < count && start + i < length; i++) {
            const value = sample(i);
            left[start + i] += value * l;
            right[start + i] += value * r;
        }
    };
    // A two-pole resonance, wide for a thud without a pitch, narrower for a knock
    const resonance = (frequency: number, q: number) => {
        const w = (2 * Math.PI * frequency) / rate;
        const alpha = Math.sin(w) / (2 * q);
        const a0 = 1 + alpha;
        const b0 = alpha / a0;
        const a1 = (-2 * Math.cos(w)) / a0;
        const a2 = (1 - alpha) / a0;
        let x1 = 0;
        let x2 = 0;
        let y1 = 0;
        let y2 = 0;
        return (x: number) => {
            const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
            x2 = x1;
            x1 = x;
            y2 = y1;
            y1 = y;
            return y;
        };
    };

    // Stones: a muffled knock of rock on rock and a dull thud. Noise, not a ringing sine:
    // the few stones at the end rang out as tones.
    const stones = make();
    let t = 0.02;
    while (t < seconds) {
        const strength = (0.12 + Math.random() * 0.3) * (0.25 + 0.75 * shaking(t));
        const decay = (0.02 + Math.random() * 0.04) * rate;
        const fade = Math.exp(-1 / decay);
        const thud = resonance(90 + Math.random() * 110, 0.6);
        const crack = resonance(200 + Math.random() * 500, 1.2);
        const click = 0.003 * rate + Math.random() * 0.005 * rate;
        let body = 10 * strength;
        add(
            stones,
            Math.floor(t * rate),
            Math.random() * 1.6 - 0.8,
            (i) => {
                body *= fade;
                const cracking = i < click ? 6 * strength * crack(Math.random() * 2 - 1) * (1 - i / click) : 0;
                return body * thud(Math.random() * 2 - 1) + cracking;
            },
            Math.floor(decay * 4),
        );
        t += -Math.log(1 - Math.random()) / (3 + 22 * shaking(t));
    }

    // Gravel shifting: many tiny grains at no beat, softly, on a little after the shaking
    const gravel = make();
    t = 0;
    while (t < seconds + 0.4) {
        const after = Math.max(0, t - seconds * 0.9);
        const moving = Math.max(shaking(t), 0.15 * Math.exp(-after * 5));
        const strength = (0.5 + Math.random() * 1) * moving;
        const grain = resonance(700 + Math.random() * 2100, 1.2);
        const size = (0.002 + Math.random() * 0.004) * rate;
        add(
            gravel,
            Math.floor(t * rate),
            Math.random() * 1.8 - 0.9,
            (i) => strength * grain(Math.random() * 2 - 1) * Math.sin((Math.PI * i) / size),
            Math.floor(size),
        );
        t += -Math.log(1 - Math.random()) / (25 + 170 * moving);
    }

    const buffer = ([left, right]: readonly [Float32Array, Float32Array]) => {
        const made = ctx.createBuffer(2, length, rate);
        made.getChannelData(0).set(left);
        made.getChannelData(1).set(right);
        return made;
    };
    return { stones: buffer(stones), gravel: buffer(gravel) };
}

/**
 * A quake over `seconds`, following the shaking of quake_strength(): a hard jolt at first,
 * dying down, and an aftershock halfway. Deep: the ground roaring, a growl above it, rock
 * groaning under the strain and stones tumbling, only gravel shifting softly above.
 */
export function play_rumble(seconds = 4.4) {
    const ctx = audio();
    if (!ctx || !effect_volume()) return;
    const limit = soft_limit(ctx);
    limit.out.connect(output(ctx, 1));
    // Deep: anything bright above the rumble sounded like scraping, only the gravel is not
    const out = ctx.createBiquadFilter();
    out.type = "lowpass";
    out.frequency.value = 500;
    out.Q.value = 0.7;
    out.connect(limit.into);
    const at = ctx.currentTime + 0.03;
    const until = at + seconds + 0.6;
    const shaking = (t: number) => quake_strength(t / seconds);

    // The ground roaring, unevenly
    const uneven = wander(3);
    const roar = ctx.createBufferSource();
    roar.buffer = brown_noise(ctx);
    roar.loop = true;
    const deep = ctx.createBiquadFilter();
    deep.type = "lowpass";
    deep.frequency.value = 85;
    deep.Q.value = 0.8;
    const roar_level = ctx.createGain();
    roar_level.gain.value = 0;
    roar_level.gain.setValueCurveAtTime(
        over(seconds, (t) => 1.6 * shaking(t) * (0.6 + 0.4 * uneven(t))),
        at,
        seconds,
    );
    roar.connect(deep).connect(roar_level).connect(out);
    roar.start(at, Math.random() * 1.5);
    roar.stop(until);

    // A rougher growl above it, rolling a little quicker
    const flutter = wander(4);
    const growl = ctx.createBufferSource();
    growl.buffer = brown_noise(ctx);
    growl.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 100;
    band.Q.value = 0.9;
    const growl_level = ctx.createGain();
    growl_level.gain.value = 0;
    growl_level.gain.setValueCurveAtTime(
        over(seconds, (t) => 1.1 * shaking(t) * (0.5 + 0.5 * flutter(t))),
        at,
        seconds,
    );
    growl.connect(band).connect(growl_level).connect(out);
    growl.start(at, Math.random() * 1.5);
    growl.stop(until);

    // The first jolt and the aftershock, see quake_strength()
    jolt(ctx, out, at, 1);
    jolt(ctx, out, at + seconds * 0.47, 0.5);

    // Rock groaning under the strain: a slow buzz through a hollow body, sticking and
    // slipping
    const strain = wander(7);
    const groan = ctx.createOscillator();
    groan.type = "sawtooth";
    groan.frequency.setValueCurveAtTime(over(seconds, (t) => 30 + 18 * strain(t), 50), at, seconds);
    const body = ctx.createBiquadFilter();
    body.type = "bandpass";
    body.frequency.value = 95;
    body.Q.value = 1;
    const groan_level = ctx.createGain();
    groan_level.gain.value = 0;
    const slips = wander(9);
    groan_level.gain.setValueCurveAtTime(
        over(seconds, (t) => 0.5 * shaking(t) ** 2 * Math.max(0, slips(t) - 0.35)),
        at,
        seconds,
    );
    const muffle = ctx.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = 300;
    groan.connect(body).connect(groan_level).connect(muffle).connect(out);
    groan.start(at);
    groan.stop(until);

    // Stones tumbling, deep with the rest, and gravel shifting above it
    const { stones, gravel } = debris(ctx, seconds);
    const tumbling = ctx.createBufferSource();
    tumbling.buffer = stones;
    tumbling.connect(out);
    tumbling.start(at);
    const shifting = ctx.createBufferSource();
    shifting.buffer = gravel;
    shifting.connect(limit.into);
    shifting.start(at);
}
