/** Smooth noise for smoke and fog, from a fixed shuffle: no texture to load */
const PERM = new Uint8Array(512);
/** The value at each lattice point, from 0 to 1 */
const VALUES = new Float32Array(256);
{
    let seed = 7;
    const order = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        seed = (seed * 16807) % 2147483647;
        const j = seed % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < 512; i++) PERM[i] = order[i & 255];
    for (let i = 0; i < 256; i++) VALUES[i] = order[i] / 255;
}

/**
 * Billowing noise from 0 to 1, coarse shapes with finer ones on them. Run for every
 * pixel of smoke and fog each frame, so without any function or object inside.
 */
export function billows(x: number, y: number, octaves = 4) {
    let sum = 0;
    let amplitude = 0.5;
    let total = 0;
    for (let octave = 0; octave < octaves; octave++) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        const x0 = PERM[xi & 255];
        const x1 = PERM[(xi + 1) & 255];
        const y0 = yi & 255;
        const y1 = (yi + 1) & 255;
        const a = VALUES[PERM[x0 + y0]];
        const b = VALUES[PERM[x1 + y0]];
        const c = VALUES[PERM[x0 + y1]];
        const d = VALUES[PERM[x1 + y1]];
        const top = a + (b - a) * u;
        sum += amplitude * (top + (c + (d - c) * u - top) * v);
        total += amplitude;
        x *= 2;
        y *= 2;
        amplitude *= 0.5;
    }
    return sum / total;
}

/** 0 below edge0, 1 above edge1, smooth in between */
export function smoothstep(edge0: number, edge1: number, value: number) {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
