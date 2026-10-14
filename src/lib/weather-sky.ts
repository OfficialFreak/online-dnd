/**
 * The night sky behind the map, in the light around it: northern lights, a blood moon in
 * a red sky, stars, and now and then a shooting star, the same moments on every screen.
 */
import { billows, smoothstep } from "$lib/noise";
import { half_layer, NONE, seeded, type Frame, type MapBox, type Shown } from "$lib/weather-common";

/** A shooting star across the sky, where it starts in fractions of the screen */
type Shooting = { at: number; x: number; y: number; angle: number; speed: number; life: number; tail: number };

/**
 * The bands of the northern lights: how high they wind through the sky, in fractions of
 * the screen, how far they swing to the side and so curl up now and then, how bright
 * and how tall their rays
 */
const CURTAINS = [
    { base: 0.2, swing: 0.07, curl: 0.1, phase: 0, bright: 1, tall: 1 },
    { base: 0.3, swing: 0.05, curl: 0.06, phase: 2.3, bright: 0.75, tall: 0.8 },
    { base: 0.12, swing: 0.04, curl: 0.04, phase: 4.6, bright: 0.5, tall: 0.65 },
];

/** The band's lower edge drawn twice, a soft glow and a brighter seam on it */
const AURORA_BAND = [
    [20, "90, 240, 170", 0.07],
    [5, "160, 255, 195", 0.16],
] as const;

/**
 * Points along a band across the screen, each with how far along it is. It sways up and
 * down and to the sides, where it swings back further than it goes on it curls.
 */
function curtain_path(curtain: (typeof CURTAINS)[number], width: number, height: number, t: number) {
    const points: [number, number, number][] = [];
    // Swinging to the side bunches the rays up where it turns, without folding over
    const curl = curtain.curl * (0.6 + 0.4 * Math.sin(t * 0.025 + curtain.phase));
    const count = Math.max(60, Math.round(width / 4));
    for (let i = 0; i <= count; i++) {
        const along = -0.1 + (i / count) * 1.2;
        const x = along * width + Math.sin(along * 7 + t * 0.06 + curtain.phase) * width * curl;
        const y =
            height * curtain.base +
            Math.sin(along * 4.3 + t * 0.05 + curtain.phase) * height * curtain.swing +
            Math.sin(along * 11 - t * 0.08 + curtain.phase * 1.7) * height * 0.015;
        points.push([x, y, along]);
    }
    return points;
}

/** Shooting stars come in windows this long, a window may have one */
const SHOOTING_WINDOW = 7000;
const STARS = 140;

/**
 * The shooting stars after `from` until `to`, in milliseconds since 1970, about one every
 * fifteen seconds
 */
function shooting_between(from: number, to: number) {
    const found: Shooting[] = [];
    for (let slot = Math.floor(from / SHOOTING_WINDOW); slot <= Math.floor(to / SHOOTING_WINDOW); slot++) {
        const next = seeded(slot * 104729 + 3);
        if (next() > 0.45) continue;
        const at = slot * SHOOTING_WINDOW + next() * SHOOTING_WINDOW;
        if (at <= from || at > to) continue;
        const right = next() < 0.5;
        found.push({
            at,
            x: 0.1 + next() * 0.8,
            y: 0.03 + next() * 0.3,
            // Down to one side, 10 to 35 degrees
            angle: (right ? 1 : -1) * (0.17 + next() * 0.44),
            speed: 0.55 + next() * 0.5,
            life: 500 + next() * 500,
            tail: 70 + next() * 110,
        });
    }
    return found;
}

export class Sky {
    private shooting: Shooting[] = [];
    private looked = Date.now();
    private stars: { x: number; y: number; size: number; phase: number }[] = [];
    private aurora_layer: HTMLCanvasElement | null = null;
    private aurora_drawn = -Infinity;
    private strip: HTMLCanvasElement | null = null;
    private moon: { radius: number; sprite: HTMLCanvasElement } | null = null;

    constructor() {
        const next = seeded(2024);
        for (let i = 0; i < STARS; i++) {
            this.stars.push({ x: next(), y: next() * 0.75, size: 0.5 + next() ** 3 * 1.4, phase: next() * 6.3 });
        }
    }

    /** Whether there is a night sky to draw at all */
    shows(shown: Shown) {
        const { aurora, blood_moon, shooting_stars } = shown;
        return aurora >= NONE || blood_moon >= NONE || shooting_stars || this.shooting.length > 0;
    }

    /** Whether it moves and wants frames, besides the slow northern lights */
    busy() {
        return this.shooting.length > 0;
    }

    update(frame: Frame) {
        const time = frame.time;
        // Back from the background, the missed ones don't all come at once
        if (time - this.looked > 2000) this.looked = time - 100;
        if (frame.shown.shooting_stars && frame.dt > 0) {
            this.shooting.push(...shooting_between(this.looked, time));
        }
        this.looked = time;
        this.shooting = this.shooting.filter((star) => time - star.at < star.life);
    }

    /** Everything of the sky, called behind the map */
    draw(frame: Frame) {
        const { aurora, blood_moon, shooting_stars } = frame.shown;
        const night = Math.max(aurora, blood_moon, shooting_stars ? 1 : 0);
        if (night >= NONE) this.draw_night(frame, night);
        if (blood_moon >= NONE) this.draw_red_sky(frame, blood_moon);
        if (night >= NONE) this.draw_stars(frame, night);
        if (aurora >= NONE) this.draw_aurora(frame, aurora);
        if (blood_moon >= NONE) this.draw_moon(frame, blood_moon);
        if (this.shooting.length) this.draw_shooting(frame);
    }

    /** A little darker around the map, so the lights of the sky show */
    private draw_night(frame: Frame, night: number) {
        const { ctx, width, height } = frame;
        const dark = ctx.createLinearGradient(0, 0, 0, height);
        dark.addColorStop(0, `rgba(4, 8, 24, ${0.4 * night})`);
        dark.addColorStop(1, `rgba(4, 8, 24, ${0.12 * night})`);
        ctx.fillStyle = dark;
        ctx.fillRect(0, 0, width, height);
    }

    private draw_red_sky(frame: Frame, strength: number) {
        const { ctx, width, height } = frame;
        const red = ctx.createLinearGradient(0, 0, 0, height);
        red.addColorStop(0, `rgba(150, 12, 10, ${0.42 * strength})`);
        red.addColorStop(0.6, `rgba(90, 6, 6, ${0.22 * strength})`);
        red.addColorStop(1, `rgba(40, 0, 0, ${0.12 * strength})`);
        ctx.fillStyle = red;
        ctx.fillRect(0, 0, width, height);
    }

    /** Small dots, twinkling a little, fewer where the sky is lower */
    private draw_stars(frame: Frame, night: number) {
        const { ctx, width, height } = frame;
        const t = frame.now / 1000;
        for (const [bright, alpha] of [
            [0.5, 0.35],
            [1, 0.8],
        ] as const) {
            ctx.beginPath();
            for (const star of this.stars) {
                const twinkle = 0.6 + 0.4 * Math.sin(t * 1.7 + star.phase * 3);
                if (twinkle > bright || twinkle <= bright - 0.5) continue;
                const x = star.x * width;
                const y = star.y * height;
                ctx.moveTo(x + star.size, y);
                ctx.arc(x, y, star.size, 0, Math.PI * 2);
            }
            ctx.fillStyle = `rgba(235, 240, 255, ${alpha * night})`;
            ctx.fill();
        }
    }

    /**
     * Northern lights as they look: bands of light winding through the upper sky, now and
     * then curling up, brightest along their lower edge, with rays rising from them here
     * and there, in bunches and of uneven height, fading upwards into violet. On a canvas
     * a third of the size, which blurs them softly, about thirty times a second.
     */
    private draw_aurora(frame: Frame, strength: number) {
        if (frame.dt === 0 || frame.now - this.aurora_drawn >= (frame.lite ? 60 : 30)) {
            this.aurora_drawn = frame.now;
            const { layer, ctx } = half_layer(this.aurora_layer, frame.width, frame.height, 3);
            this.aurora_layer = layer;
            const ray = this.aurora_strip();
            const { width, height } = frame;
            const t = frame.now / 1000;
            const step = frame.lite ? 2 : 1;
            ctx.globalCompositeOperation = "lighter";
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            for (const curtain of CURTAINS) {
                const points = curtain_path(curtain, width, height, t);
                // The curtain is its rays, close together: faint all along, bright in
                // bunches, single ones taller and brighter than their neighbours
                for (let i = 0; i < points.length; i += step) {
                    const [x, y, along] = points[i];
                    const bunch = smoothstep(0.3, 0.72, billows(along * 3.2 + curtain.phase, t * 0.03, 2));
                    const single = billows(along * 70 + curtain.phase * 3, t * 0.18, 1);
                    const tall = height * (0.06 + 0.24 * bunch * (0.6 + 0.4 * single)) * curtain.tall;
                    ctx.globalAlpha = Math.min(
                        1,
                        strength * curtain.bright * (0.14 + 0.6 * bunch) * (0.5 + 0.5 * single),
                    );
                    ctx.drawImage(ray, x - 8, y - tall, 16, tall + 3);
                }
                // The band itself, a wide soft glow and its bright lower edge
                ctx.globalAlpha = 1;
                for (const [line, colour, alpha] of AURORA_BAND) {
                    ctx.beginPath();
                    for (let i = 0; i < points.length; i++) {
                        const [x, y] = points[i];
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.lineWidth = line;
                    ctx.strokeStyle = `rgba(${colour}, ${alpha * strength * curtain.bright})`;
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = "source-over";
        }
        frame.ctx.drawImage(this.aurora_layer!, 0, 0, frame.width, frame.height);
    }

    /**
     * One ray of the curtain, drawn once: green at its foot, violet higher up, fading out
     * to both sides so the rays blend into each other
     */
    private aurora_strip() {
        if (this.strip) return this.strip;
        const strip = document.createElement("canvas");
        strip.width = 16;
        strip.height = 128;
        const ctx = strip.getContext("2d")!;
        const light = ctx.createLinearGradient(0, 128, 0, 0);
        light.addColorStop(0, "rgba(120, 255, 170, 0)");
        light.addColorStop(0.04, "rgba(120, 255, 170, 0.95)");
        light.addColorStop(0.3, "rgba(70, 240, 160, 0.6)");
        light.addColorStop(0.65, "rgba(70, 200, 170, 0.25)");
        light.addColorStop(0.85, "rgba(140, 90, 255, 0.12)");
        light.addColorStop(1, "rgba(160, 80, 255, 0)");
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, 16, 128);
        const sides = ctx.createLinearGradient(0, 0, 16, 0);
        sides.addColorStop(0, "rgba(0, 0, 0, 0)");
        sides.addColorStop(0.5, "rgba(0, 0, 0, 1)");
        sides.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = sides;
        ctx.fillRect(0, 0, 16, 128);
        return (this.strip = strip);
    }

    /**
     * A big red moon with a glow, in the free sky beside or above the map: a photo of the
     * moon, until it has loaded a drawn one
     */
    private draw_moon(frame: Frame, strength: number) {
        const { ctx, width, height } = frame;
        const radius = Math.round(Math.min(90, Math.max(28, Math.min(width, height) * 0.07)));
        const photo = moon_photo(() => (this.moon = null));
        if (this.moon?.radius !== radius) this.moon = { radius, sprite: moon_sprite(radius, photo) };
        const [x, y] = moon_spot(frame.map, width, height, radius);
        const size = this.moon.sprite.width;
        ctx.globalAlpha = strength;
        ctx.drawImage(this.moon.sprite, x - size / 2, y - size / 2);
        ctx.globalAlpha = 1;
    }

    /** A bright head with a fading tail, quick across the sky */
    private draw_shooting(frame: Frame) {
        const { ctx, width, height, time } = frame;
        ctx.save();
        ctx.lineCap = "round";
        for (const star of this.shooting) {
            const age = (time - star.at) / star.life;
            if (age < 0 || age > 1) continue;
            const travel = star.speed * Math.min(width, 1600) * age;
            // The sign of the angle is the side it flies to
            const dx = Math.sign(star.angle) * Math.cos(star.angle);
            const dy = Math.sin(Math.abs(star.angle));
            const hx = star.x * width + dx * travel;
            const hy = star.y * height + dy * travel;
            const tail = star.tail * Math.min(1, age * 4);
            const tx = hx - dx * tail;
            const ty = hy - dy * tail;
            // Flares up and goes out
            const bright = Math.sin(Math.PI * age) ** 0.6;
            const line = ctx.createLinearGradient(hx, hy, tx, ty);
            line.addColorStop(0, `rgba(255, 255, 255, ${0.95 * bright})`);
            line.addColorStop(1, "rgba(200, 215, 255, 0)");
            ctx.strokeStyle = line;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            ctx.fillStyle = `rgba(255, 255, 255, ${bright})`;
            ctx.beginPath();
            ctx.arc(hx, hy, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

/**
 * Where the moon goes: in the room right or left of the map, else above it, else in the
 * top right corner, where the map may hide it
 */
function moon_spot(map: MapBox | null, width: number, height: number, radius: number): [number, number] {
    const room = radius * 2 + 40;
    const y = Math.max(radius + 20, height * 0.2);
    if (!map) return [width * 0.8, height * 0.2];
    const right = width - map.right;
    if (right >= room) return [map.right + right / 2, y];
    if (map.left >= room) return [map.left / 2, y];
    if (map.top >= room) return [width * 0.78, map.top / 2];
    return [width - radius - 30, radius + 30];
}

let photo: HTMLImageElement | null = null;
let photo_loaded = false;

/**
 * The photo of the moon, loaded once: the near side as the Lunar Reconnaissance Orbiter
 * saw it (NASA/GSFC/Arizona State University, public domain), see static/weather. Null
 * until it is there, `loaded` comes then.
 */
function moon_photo(loaded: () => void) {
    if (photo_loaded) return photo;
    if (!photo && typeof Image !== "undefined") {
        photo = new Image();
        photo.onload = () => {
            photo_loaded = true;
            loaded();
        };
        photo.src = "/weather/moon.webp";
    }
    return null;
}

/**
 * The moon drawn once: a glow, and the photo in the deep red of a moon in the Earth's
 * shadow, brighter on one side. Without the photo a red disc with a few darker seas.
 */
function moon_sprite(radius: number, picture: HTMLImageElement | null) {
    const size = Math.ceil(radius * 6);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    const glow = ctx.createRadialGradient(c, c, radius * 0.8, c, c, radius * 3);
    glow.addColorStop(0, "rgba(255, 60, 30, 0.35)");
    glow.addColorStop(1, "rgba(255, 40, 20, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    if (picture) {
        const side = Math.ceil(radius * 2);
        const disc = document.createElement("canvas");
        disc.width = disc.height = side;
        const d = disc.getContext("2d")!;
        d.drawImage(picture, 0, 0, side, side);
        d.globalCompositeOperation = "multiply";
        d.fillStyle = "rgb(255, 132, 86)";
        d.fillRect(0, 0, side, side);
        // Lit more from one side, darker towards the other
        const light = d.createRadialGradient(side * 0.32, side * 0.7, side * 0.05, side * 0.5, side * 0.5, side * 0.8);
        light.addColorStop(0, "rgb(255, 245, 228)");
        light.addColorStop(1, "rgb(135, 80, 72)");
        d.fillStyle = light;
        d.fillRect(0, 0, side, side);
        // The seas not quite black
        d.globalCompositeOperation = "screen";
        d.fillStyle = "rgb(46, 8, 4)";
        d.fillRect(0, 0, side, side);
        // Only the disc
        d.globalCompositeOperation = "destination-in";
        d.drawImage(picture, 0, 0, side, side);
        ctx.drawImage(disc, c - radius, c - radius, radius * 2, radius * 2);
        return canvas;
    }
    const disc = ctx.createRadialGradient(c - radius * 0.3, c - radius * 0.3, radius * 0.1, c, c, radius);
    disc.addColorStop(0, "rgb(225, 80, 55)");
    disc.addColorStop(0.7, "rgb(175, 40, 28)");
    disc.addColorStop(1, "rgb(120, 22, 16)");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, Math.PI * 2);
    ctx.fill();
    const next = seeded(radius);
    ctx.fillStyle = "rgba(90, 10, 8, 0.35)";
    for (let i = 0; i < 6; i++) {
        const angle = next() * Math.PI * 2;
        const distance = next() * radius * 0.6;
        ctx.beginPath();
        ctx.arc(c + Math.cos(angle) * distance, c + Math.sin(angle) * distance, radius * (0.1 + next() * 0.22), 0, Math.PI * 2);
        ctx.fill();
    }
    return canvas;
}
