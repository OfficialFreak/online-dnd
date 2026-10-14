/**
 * What the parts of the weather share: a random generator that gives the same numbers on
 * every screen, the map's box, what each part gets every frame, and the wind's gusts and
 * the passing storms, which come from the clock so everyone sees them at once.
 */
import { smoothstep } from "$lib/noise";

/** Below this an amount counts as none */
export const NONE = 0.01;

/** A random number generator from a seed (mulberry32), the same numbers everywhere */
export function seeded(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The map's box on the screen */
export type MapBox = { left: number; top: number; right: number; bottom: number };

/** The weather as it is drawn right now, easing towards the DM's, every amount filled in */
export type Shown = {
    rain: number;
    snow: number;
    fog: number;
    wind: number;
    ash: number;
    sand: number;
    aurora: number;
    blood_moon: number;
    lightning: boolean;
    shooting_stars: boolean;
};

/** What every part of the weather gets each frame */
export type Frame = {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    /** Where the map is, null without one */
    map: MapBox | null;
    /** performance.now() */
    now: number;
    /** Date.now(), the same moment on every screen */
    time: number;
    /** Seconds since the last frame, 0 for a still picture */
    dt: number;
    /** The wind with its gusts, beyond -1 and 1 while one blows */
    wind: number;
    shown: Shown;
    /** Fewer particles, for phones */
    lite: boolean;
    /** How many particles of at most `max` on a 1080p screen, for this screen */
    count: (max: number, amount: number) => number;
    /** Paints only where the map isn't, as if behind it */
    behind_map: (paint: () => void) => void;
};

/** Removes the particle at `i` without keeping the order, the last takes its place */
export function drop_at<T>(list: T[], i: number) {
    list[i] = list[list.length - 1];
    list.pop();
}

/** Gusts come in slots of this many milliseconds, a slot may have one */
const GUST_SLOT = 9000;

/**
 * How strong a gust blows now, from 0 to 1, the same on every screen: one every ten
 * seconds or so, rising over a second or two and dying away over a few
 */
export function gust_at(time: number) {
    let strongest = 0;
    const slot = Math.floor(time / GUST_SLOT);
    // One from the slot before may still be dying away
    for (let at = slot - 1; at <= slot; at++) {
        const next = seeded(at * 7919 + 13);
        if (next() > 0.75) continue;
        const start = at * GUST_SLOT + next() * GUST_SLOT;
        const rise = 700 + next() * 1300;
        const fall = 1800 + next() * 3200;
        const strength = 0.4 + next() * 0.6;
        const since = time - start;
        if (since < 0 || since > rise + fall) continue;
        const shape =
            since < rise ? smoothstep(0, 1, since / rise) : 1 - smoothstep(0, 1, (since - rise) / fall);
        strongest = Math.max(strongest, strength * shape);
    }
    return strongest;
}

/**
 * The wind with its gusts: the stronger it blows, the stronger they are. A breeze stays
 * a breeze.
 */
export function gusty(wind: number, time: number) {
    const gust = gust_at(time) * Math.min(1, Math.abs(wind) * 2);
    return wind * (1 + 1.1 * gust);
}

/**
 * How hard a quake shakes from its start (0) to its end (1): a hard jolt, dying down, and
 * an aftershock about halfway. The map, the rubble and the rumble all follow it.
 */
export function quake_strength(progress: number) {
    if (progress < 0 || progress > 1) return 0;
    const first = Math.exp(-progress * 4.5);
    const after = 0.6 * Math.exp(-(((progress - 0.5) / 0.08) ** 2));
    return Math.min(1, first + after) * (1 - progress ** 3);
}

/** A thunderstorm comes up, passes overhead and moves on in this many milliseconds */
const STORM_PASS = 6 * 60_000;

/**
 * How close the thunderstorm is, from 0 far off to 1 right overhead, the same on every
 * screen. Each one comes up, passes and moves on, some come closer than others.
 */
export function storm_closeness(time: number) {
    const pass = Math.floor(time / STORM_PASS);
    const phase = (time - pass * STORM_PASS) / STORM_PASS;
    const nearest = 0.65 + seeded(pass * 31 + 7)() * 0.35;
    return nearest * Math.sin(Math.PI * phase) ** 2;
}

/** Soft cloud banks of many puffs, drawn once and then only moved */
export function cloud_sprite(colour = "235, 238, 244") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 230;
    const ctx = canvas.getContext("2d")!;
    // Many soft puffs inside an ellipse, denser in the middle
    for (let i = 0; i < 18; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * 0.7;
        const x = 256 + Math.cos(angle) * distance * 180;
        const y = 115 + Math.sin(angle) * distance * 60;
        const radius = 50 + Math.random() * 60;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(${colour}, ${0.18 + Math.random() * 0.12})`);
        gradient.addColorStop(1, `rgba(${colour}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    return canvas;
}

/**
 * A canvas at a `fraction` of the size of the screen, half by default, for what is soft
 * anyway and drawn less often. Stretched over the screen it blurs.
 */
export function half_layer(layer: HTMLCanvasElement | null, width: number, height: number, fraction = 2) {
    layer ??= document.createElement("canvas");
    const w = Math.max(1, Math.ceil(width / fraction));
    const h = Math.max(1, Math.ceil(height / fraction));
    if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
    }
    const ctx = layer.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(w / Math.max(1, width), 0, 0, h / Math.max(1, height), 0, 0);
    return { layer, ctx };
}
