/** Smooth noise for smoke and fog, from a fixed shuffle: no texture to load */
const PERM = new Uint8Array(512);
{
    let seed = 7;
    const order = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
        seed = (seed * 16807) % 2147483647;
        const j = seed % (i + 1);
        [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < 512; i++) PERM[i] = order[i & 255];
}

function noise(x: number, y: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const at = (dx: number, dy: number) => PERM[(PERM[(xi + dx) & 255] + yi + dy) & 255] / 255;
    const top = at(0, 0) + (at(1, 0) - at(0, 0)) * u;
    const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * u;
    return top + (bottom - top) * v;
}

/** Billowing noise from 0 to 1, coarse shapes with finer ones on them */
export function billows(x: number, y: number) {
    let sum = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let octave = 0; octave < 4; octave++) {
        sum += amplitude * noise(x * frequency, y * frequency);
        frequency *= 2;
        amplitude *= 0.5;
    }
    return sum / 0.9375;
}

/** 0 below edge0, 1 above edge1, smooth in between */
export function smoothstep(edge0: number, edge1: number, value: number) {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
