/**
 * Light and darkness by the rules of 5e: a spot shows in colour if a figure sees it and
 * a light or the scene lights it at least dimly. In darkvision, darkness counts as dim
 * light and shows in grey, dim light as bright light.
 */
import type { Point } from "$lib/vision";

export type Lighting = "bright" | "dim" | "dark";

/** A light on the map, its radii in feet. Dim reaches further and includes bright. */
export type SceneLight = {
    id: string;
    x: number;
    y: number;
    bright: number;
    dim: number;
    color?: string;
    on?: boolean;
};

/** A light a figure carries */
export type CarriedLight = { bright: number; dim: number; color?: string };

/** Flames are warm, magic light cool */
export const LIGHT_PRESETS = [
    { key: "candle", label: "Kerze", bright: 5, dim: 10, color: "#ffb04d" },
    { key: "torch", label: "Fackel", bright: 20, dim: 40, color: "#ff8a2b" },
    { key: "lamp", label: "Lampe", bright: 15, dim: 45, color: "#ffc061" },
    { key: "lantern", label: "Laterne", bright: 30, dim: 60, color: "#ffcf7a" },
    { key: "light", label: "Licht (Zauber)", bright: 20, dim: 40, color: "#cfe3ff" },
    { key: "daylight", label: "Tageslicht (Zauber)", bright: 60, dim: 120, color: "#fff6e0" },
] as const;

export type LightPreset = (typeof LIGHT_PRESETS)[number]["key"];

export const LIGHTING_LABELS: Record<Lighting, string> = {
    bright: "Hell",
    dim: "Dämmrig",
    dark: "Dunkel",
};

export function preset_of(light: CarriedLight | null | undefined) {
    if (!light) return null;
    return (
        LIGHT_PRESETS.find(
            (preset) => preset.bright === light.bright && preset.dim === light.dim,
        ) ?? null
    );
}

/**
 * A colour as #rrggbb, also from exported maps that write it with alpha in front or behind
 * (ffeeccaa), null if it isn't one
 */
export function hex_colour(colour: unknown): string | null {
    let hex = String(colour ?? "").replace("#", "").toLowerCase();
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return null;
    if (hex.length === 8) {
        hex = hex.startsWith("ff") && !hex.endsWith("ff") ? hex.slice(2) : hex.slice(0, 6);
    }
    return `#${hex}`;
}

/** The lights of a scene, also those an older import stored with a range only */
export function scene_lights(raw: any[] | null | undefined): SceneLight[] {
    return (raw ?? [])
        .map((light, index) => {
            const range = Number(light?.range);
            const dim = Number(light?.dim ?? range) || 0;
            const bright = Number(light?.bright ?? (Number.isFinite(range) ? range / 2 : 0)) || 0;
            return {
                id: String(light?.id ?? `l${index}`),
                x: Number(light?.x),
                y: Number(light?.y),
                bright: Math.min(bright, dim),
                dim,
                color: hex_colour(light?.color) ?? undefined,
                on: light?.on !== false,
            };
        })
        .filter(
            (light) => Number.isFinite(light.x) && Number.isFinite(light.y) && light.dim > 0,
        );
}

/** A light shining on the map: where it is and what it reaches past the walls, in cells */
export type Lamp = {
    point: Point;
    polygon: Point[];
    bright: number;
    dim: number;
    color?: string;
};
/** A figure looking: where it stands, what it sees past the walls, darkvision in cells */
export type Eye = { point: Point; polygon: Point[]; darkvision: number };

/**
 * How well every spot of the map is seen, in a small picture stretched over the map: red
 * is how bright (0 unseen, about 128 dim, 255 bright), green whether there is colour.
 */
export type Sight = {
    width: number;
    height: number;
    scale_x: number;
    scale_y: number;
    seen: Uint8ClampedArray;
    /** The darkening over the map */
    shade: ImageData;
    /** Grey over what only darkvision sees, null if nothing */
    grey: ImageData | null;
    /** The glow of coloured lights where they are seen, null if none */
    tint: ImageData | null;
    /** How bright the lights and the scene make each spot, without the figures */
    lit: Uint8ClampedArray;
};

/** About 12 pixels per cell, the browser stretches the picture softly over the map */
const PIXELS_PER_CELL = 12;
/** Darkening of what isn't seen, out of 255 */
const UNSEEN = 158;
/** Brightness from which a spot counts as seen, dim light is about 128 */
export const SEEN = 60;

let canvases: HTMLCanvasElement[] | null = null;

function contexts(width: number, height: number) {
    canvases ??= [0, 1, 2, 3].map(() => document.createElement("canvas"));
    return canvases.map((canvas) => {
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        // Read back every time, so it stays on the CPU
        return canvas.getContext("2d", { willReadFrequently: true })!;
    });
}

function trace(ctx: CanvasRenderingContext2D, polygon: Point[], sx: number, sy: number) {
    ctx.beginPath();
    ctx.moveTo(polygon[0][0] * sx, polygon[0][1] * sy);
    for (let i = 1; i < polygon.length; i++) {
        ctx.lineTo(polygon[i][0] * sx, polygon[i][1] * sy);
    }
    ctx.closePath();
}

/** The size of the small pictures for a map */
function picture_size(columns: number, rows: number) {
    const width = Math.max(1, Math.min(1024, Math.round(columns * PIXELS_PER_CELL)));
    const height = Math.max(1, Math.round((width * rows) / columns));
    return { width, height, sx: width / columns, sy: height / rows };
}

/** Bright light in the middle, dim light around it, past the walls */
function draw_light(ctx: CanvasRenderingContext2D, lamp: Lamp, sx: number, sy: number) {
    if (lamp.polygon.length < 3 || lamp.dim <= 0) return;
    const cx = lamp.point[0] * sx;
    const cy = lamp.point[1] * sy;
    const radius = lamp.dim * sx;
    const edge = Math.min(0.96, lamp.bright / lamp.dim);
    const soft = 0.03;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, "rgb(255, 255, 0)");
    gradient.addColorStop(Math.max(0, edge - soft), "rgb(255, 255, 0)");
    gradient.addColorStop(Math.min(1, edge + soft), "rgb(128, 255, 0)");
    gradient.addColorStop(Math.max(edge + soft, 1 - soft), "rgb(128, 255, 0)");
    gradient.addColorStop(1, "rgba(128, 255, 0, 0)");
    ctx.save();
    trace(ctx, lamp.polygon, sx, sy);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

/** A faint glow in the light's colour, overlapping lights don't add up to white */
function draw_glow(ctx: CanvasRenderingContext2D, lamp: Lamp, sx: number, sy: number) {
    if (!lamp.color || lamp.polygon.length < 3 || lamp.dim <= 0) return;
    const cx = lamp.point[0] * sx;
    const cy = lamp.point[1] * sy;
    const radius = lamp.dim * sx;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, colour_alpha(lamp.color, 0.32));
    gradient.addColorStop(Math.min(0.95, lamp.bright / lamp.dim), colour_alpha(lamp.color, 0.18));
    gradient.addColorStop(1, colour_alpha(lamp.color, 0));
    ctx.save();
    trace(ctx, lamp.polygon, sx, sy);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

/**
 * The scene's own light and its placed lights, drawn only when those or the walls change.
 * A big map has a hundred and more, drawing them on every step of a figure was slow.
 */
export type LightBase = {
    width: number;
    height: number;
    light: HTMLCanvasElement;
    glow: HTMLCanvasElement | null;
};

export function light_base(
    columns: number,
    rows: number,
    lighting: Lighting,
    lamps: Lamp[],
): LightBase {
    const { width, height, sx, sy } = picture_size(columns, rows);
    const light_canvas = document.createElement("canvas");
    light_canvas.width = width;
    light_canvas.height = height;
    const light = light_canvas.getContext("2d")!;
    light.fillStyle =
        lighting === "bright"
            ? "rgb(255, 255, 0)"
            : lighting === "dim"
              ? "rgb(128, 255, 0)"
              : "rgb(0, 0, 0)";
    light.fillRect(0, 0, width, height);
    light.globalCompositeOperation = "lighten";
    for (const lamp of lamps) draw_light(light, lamp, sx, sy);

    let glow_canvas: HTMLCanvasElement | null = null;
    if (lamps.some((lamp) => lamp.color)) {
        glow_canvas = document.createElement("canvas");
        glow_canvas.width = width;
        glow_canvas.height = height;
        const glow = glow_canvas.getContext("2d")!;
        glow.globalCompositeOperation = "lighter";
        for (const lamp of lamps) draw_glow(glow, lamp, sx, sy);
    }
    return { width, height, light: light_canvas, glow: glow_canvas };
}

/** The placed lights and those the figures carry, glowing where the mask lets them */
function glow_of(
    ctx: CanvasRenderingContext2D,
    base: LightBase,
    carried: Lamp[],
    sx: number,
    sy: number,
    mask: HTMLCanvasElement | null,
) {
    if (!base.glow && !carried.some((lamp) => lamp.color)) return null;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, base.width, base.height);
    if (base.glow) ctx.drawImage(base.glow, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    for (const lamp of carried) draw_glow(ctx, lamp, sx, sy);
    if (mask) {
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(mask, 0, 0);
    }
    ctx.globalCompositeOperation = "source-over";
    return ctx.getImageData(0, 0, base.width, base.height);
}

export function compute_sight(
    base: LightBase,
    columns: number,
    rows: number,
    carried: Lamp[],
    eyes: Eye[],
): Sight {
    const { width, height, sx, sy } = picture_size(columns, rows);
    const [light, eye_ctx, seen_ctx, glow_ctx] = contexts(width, height);

    // How bright the map is without the figures: the scene and its lights, then the
    // lights the figures carry
    light.globalCompositeOperation = "source-over";
    light.clearRect(0, 0, width, height);
    light.drawImage(base.light, 0, 0);
    light.globalCompositeOperation = "lighten";
    for (const lamp of carried) draw_light(light, lamp, sx, sy);

    // What each figure sees of it, the best of all figures counts
    seen_ctx.globalCompositeOperation = "source-over";
    seen_ctx.clearRect(0, 0, width, height);
    for (const eye of eyes) {
        if (eye.polygon.length < 3) continue;
        eye_ctx.globalCompositeOperation = "source-over";
        eye_ctx.clearRect(0, 0, width, height);
        eye_ctx.drawImage(light.canvas, 0, 0);
        if (eye.darkvision > 0) {
            // Darkness becomes dim, dim becomes bright, without colour where it was dark
            eye_ctx.globalCompositeOperation = "lighter";
            eye_ctx.fillStyle = "rgb(128, 0, 0)";
            eye_ctx.beginPath();
            eye_ctx.arc(eye.point[0] * sx, eye.point[1] * sy, eye.darkvision * sx, 0, Math.PI * 2);
            eye_ctx.fill();
        }
        eye_ctx.globalCompositeOperation = "destination-in";
        eye_ctx.fillStyle = "#000";
        trace(eye_ctx, eye.polygon, sx, sy);
        eye_ctx.fill();
        seen_ctx.globalCompositeOperation = "lighten";
        seen_ctx.drawImage(eye_ctx.canvas, 0, 0);
    }
    const seen = seen_ctx.getImageData(0, 0, width, height).data;
    const lit = light.getImageData(0, 0, width, height).data;
    const tint = glow_of(glow_ctx, base, carried, sx, sy, seen_ctx.canvas);

    const shade = new ImageData(width, height);
    const grey = new ImageData(width, height);
    let any_grey = false;
    for (let i = 0; i < seen.length; i += 4) {
        const alpha = seen[i + 3] / 255;
        const level = seen[i] * alpha;
        shade.data[i] = 6;
        shade.data[i + 1] = 8;
        shade.data[i + 2] = 14;
        shade.data[i + 3] = Math.round(UNSEEN * (1 - level / 255));
        // Colour unweighted: soft edges are faint, not grey
        if (level > SEEN && seen[i + 1] < 128) {
            grey.data[i] = grey.data[i + 1] = grey.data[i + 2] = 128;
            grey.data[i + 3] = 255;
            any_grey = true;
        }
    }
    return {
        width,
        height,
        scale_x: sx,
        scale_y: sy,
        seen,
        shade,
        grey: any_grey ? grey : null,
        tint,
        lit,
    };
}

function colour_alpha(hex: string, alpha: number) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The glow of the lights for the DM, who sees everything */
export function compute_tint(base: LightBase, columns: number, rows: number, carried: Lamp[]) {
    const { width, height, sx, sy } = picture_size(columns, rows);
    const [, , , glow_ctx] = contexts(width, height);
    const tint = glow_of(glow_ctx, base, carried, sx, sy, null);
    return tint && { width, height, tint };
}

/** How bright the lights make this spot without the figures, in cells */
export function lit_at(sight: Sight, [x, y]: Point) {
    const px = Math.min(sight.width - 1, Math.max(0, Math.floor(x * sight.scale_x)));
    const py = Math.min(sight.height - 1, Math.max(0, Math.floor(y * sight.scale_y)));
    return sight.lit[(py * sight.width + px) * 4];
}

/** How bright this spot is seen, in cells: 0 unseen, about 128 dim, 255 bright */
export function seen_at(sight: Sight, [x, y]: Point) {
    const px = Math.min(sight.width - 1, Math.max(0, Math.floor(x * sight.scale_x)));
    const py = Math.min(sight.height - 1, Math.max(0, Math.floor(y * sight.scale_y)));
    const i = (py * sight.width + px) * 4;
    return (sight.seen[i] * sight.seen[i + 3]) / 255;
}

/** How bright a scene is without lights, from the ambient colour of an exported map */
export function lighting_of_colour(colour: unknown): Lighting {
    const hex = hex_colour(colour);
    if (!hex) return "bright";
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance >= 0.75 ? "bright" : luminance >= 0.3 ? "dim" : "dark";
}
