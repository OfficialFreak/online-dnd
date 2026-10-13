import { asset_url } from "./assets";
import { appState } from "./state.svelte";

/** Worked out once for each portrait */
const colours = new Map<string, Promise<string | null>>();

/**
 * The colour a portrait is known by, light enough to show on a dark plate: the average of
 * its colourful pixels, from the server's small picture of it. Null if the picture can't
 * be read, e.g. from another server without permission.
 */
export function portrait_colour(file: string): Promise<string | null> {
    let colour = colours.get(file);
    if (!colour) {
        colour = work_out(file);
        colours.set(file, colour);
    }
    return colour;
}

async function work_out(file: string) {
    try {
        const image = new Image();
        const server = `${appState.secure ? "https://" : "http://"}${appState.baseUrl}`;
        const elsewhere = new URL(server).origin !== location.origin;
        if (elsewhere) image.crossOrigin = "anonymous";
        // From the desktop app the server has to allow reading it. Its own address: the
        // same picture shown on a marker was kept without that permission.
        image.src = asset_url(`${file}_thumbnail.webp`) + (elsewhere ? "&read=1" : "");
        await image.decode();
        const size = 16;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0, size, size);
        const pixels = ctx.getImageData(0, 0, size, size).data;

        // Colourful pixels count more, so a grey background doesn't wash it out
        let [red, green, blue, total] = [0, 0, 0, 0];
        for (let i = 0; i < pixels.length; i += 4) {
            const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3] / 255];
            const max = Math.max(r, g, b);
            const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
            const weight = a * (0.05 + saturation * saturation);
            red += r * weight;
            green += g * weight;
            blue += b * weight;
            total += weight;
        }
        if (total === 0) return null;
        const [hue, saturation] = hsl(red / total, green / total, blue / total);
        // Light and clear enough for a thin rim on the dark plate
        const shown = Math.min(0.8, Math.max(0.35, saturation));
        return `hsl(${Math.round(hue)} ${Math.round(shown * 100)}% 62% / 0.8)`;
    } catch {
        return null;
    }
}

function hsl(r: number, g: number, b: number): [number, number] {
    [r, g, b] = [r / 255, g / 255, b / 255];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    if (max === min) return [0, 0];
    const d = max - min;
    const saturation = lightness > 0.5 ? d / (2 - max - min) : d / (max + min);
    let hue: number;
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    return [hue * 60, saturation];
}
