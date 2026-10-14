/**
 * The night sky behind the map, in the light around it: northern lights, a blood moon in
 * a red sky, stars, and now and then a shooting star, the same moments on every screen.
 */
import { half_layer, NONE, seeded, type Frame, type MapBox, type Shown } from "$lib/weather-common";

/** A shooting star across the sky, where it starts in fractions of the screen */
type Shooting = { at: number; x: number; y: number; angle: number; speed: number; life: number; tail: number };

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
     * Curtains of light in the upper sky: many thin strips, bright green below, fading
     * into violet above, swaying slowly. At half the size about thirty times a second.
     */
    private draw_aurora(frame: Frame, strength: number) {
        if (frame.dt === 0 || frame.now - this.aurora_drawn >= (frame.lite ? 60 : 30)) {
            this.aurora_drawn = frame.now;
            const { layer, ctx } = half_layer(this.aurora_layer, frame.width, frame.height);
            this.aurora_layer = layer;
            const strip = this.aurora_strip();
            const { width, height } = frame;
            const t = frame.now / 1000;
            const gap = frame.lite ? 6 : 3;
            ctx.globalCompositeOperation = "lighter";
            for (const curtain of [0, 1, 2]) {
                const phase = curtain * 2.1;
                const base = height * (0.2 + curtain * 0.07);
                for (let x = -gap; x < width + gap; x += gap) {
                    const y =
                        base +
                        Math.sin(x * 0.0035 + t * 0.09 + phase) * height * 0.06 +
                        Math.sin(x * 0.011 - t * 0.15 + phase * 1.7) * height * 0.02;
                    const tall = height * (0.12 + 0.08 * Math.sin(x * 0.006 + t * 0.12 + phase * 0.6));
                    // Brighter and fainter strips, drifting along
                    const shimmer =
                        0.5 +
                        0.3 * Math.sin(x * 0.045 + t * 0.7 + phase) +
                        0.2 * Math.sin(x * 0.13 - t * 1.3 + phase * 2);
                    ctx.globalAlpha = Math.max(0, shimmer) * strength * (curtain === 1 ? 0.6 : 0.45);
                    ctx.drawImage(strip, x, y - tall, gap + 1, tall);
                }
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = "source-over";
        }
        frame.ctx.drawImage(this.aurora_layer!, 0, 0, frame.width, frame.height);
    }

    /** One strip of the curtain, drawn once: green at its foot, violet higher up */
    private aurora_strip() {
        if (this.strip) return this.strip;
        const strip = document.createElement("canvas");
        strip.width = 2;
        strip.height = 128;
        const ctx = strip.getContext("2d")!;
        const light = ctx.createLinearGradient(0, 128, 0, 0);
        light.addColorStop(0, "rgba(90, 255, 170, 0)");
        light.addColorStop(0.08, "rgba(90, 255, 170, 0.95)");
        light.addColorStop(0.35, "rgba(60, 230, 160, 0.55)");
        light.addColorStop(0.7, "rgba(130, 90, 255, 0.3)");
        light.addColorStop(1, "rgba(160, 80, 255, 0)");
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, 2, 128);
        return (this.strip = strip);
    }

    /** A big red moon with a glow, in the free sky beside or above the map */
    private draw_moon(frame: Frame, strength: number) {
        const { ctx, width, height } = frame;
        const radius = Math.round(Math.min(64, Math.max(22, Math.min(width, height) * 0.055)));
        if (this.moon?.radius !== radius) this.moon = { radius, sprite: moon_sprite(radius) };
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

/** The moon drawn once: a glow, a disc dark red at its rim, a few darker seas */
function moon_sprite(radius: number) {
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
