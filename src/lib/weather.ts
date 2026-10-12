import type { Weather } from "$lib/types/messaging/server_messages";

export const CLEAR: Weather = { rain: 0, snow: 0, fog: 0, wind: 0, lightning: false };

/** One click weather for the DM, the sliders fine-tune it */
export const PRESETS: { label: string; icon: string; weather: Weather }[] = [
    { label: "Klar", icon: "fa-sun", weather: CLEAR },
    {
        label: "Niesel",
        icon: "fa-cloud-rain",
        weather: { rain: 0.3, snow: 0, fog: 0.25, wind: 0.1, lightning: false },
    },
    {
        label: "Regen",
        icon: "fa-cloud-showers-heavy",
        weather: { rain: 0.75, snow: 0, fog: 0.1, wind: 0.25, lightning: false },
    },
    {
        label: "Gewitter",
        icon: "fa-cloud-bolt",
        weather: { rain: 1, snow: 0, fog: 0.2, wind: 0.5, lightning: true },
    },
    {
        label: "Schneeregen",
        icon: "fa-icicles",
        weather: { rain: 0.45, snow: 0.45, fog: 0.15, wind: 0.2, lightning: false },
    },
    {
        label: "Schnee",
        icon: "fa-snowflake",
        weather: { rain: 0, snow: 0.6, fog: 0, wind: 0.1, lightning: false },
    },
    {
        label: "Schneesturm",
        icon: "fa-wind",
        weather: { rain: 0, snow: 1, fog: 0.35, wind: 0.9, lightning: false },
    },
    {
        label: "Nebel",
        icon: "fa-smog",
        weather: { rain: 0, snow: 0, fog: 0.8, wind: 0.05, lightning: false },
    },
];

const NONE = 0.01;

/** Lightning comes in windows of this many milliseconds, each may have a flash */
const FLASH_WINDOW = 8000;

/** A random number generator from a seed (mulberry32), the same numbers everywhere */
function seeded(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The flashes after `from` until `to`, in milliseconds since 1970. They come from the
 * clock, so every screen flashes at the same moment without the server. Each brings
 * how long its thunder takes and how loud it is.
 */
export function flashes_between(from: number, to: number) {
    const flashes: { at: number; thunder_delay: number; loudness: number }[] = [];
    for (
        let slot = Math.floor(from / FLASH_WINDOW);
        slot <= Math.floor(to / FLASH_WINDOW);
        slot++
    ) {
        const next = seeded(slot);
        if (next() > 0.6) continue;
        const at = slot * FLASH_WINDOW + next() * FLASH_WINDOW;
        if (at <= from || at > to) continue;
        // Close storms thunder soon and loud, far ones later and quieter
        const distance = next();
        flashes.push({
            at,
            thunder_delay: 400 + distance * 3200,
            loudness: 1 - distance * 0.5,
        });
    }
    return flashes;
}

export function is_clear(weather: Weather | null | undefined) {
    return (
        !weather ||
        (weather.rain < NONE &&
            weather.snow < NONE &&
            weather.fog < NONE &&
            !weather.lightning)
    );
}

/** Icons for a scene's weather in the scene list */
export function weather_icons(weather: Weather | null | undefined) {
    if (is_clear(weather) || !weather) return [];
    const icons = [];
    if (weather.lightning) icons.push("fa-cloud-bolt");
    else if (weather.rain >= NONE) icons.push("fa-cloud-rain");
    if (weather.snow >= NONE) icons.push("fa-snowflake");
    if (weather.fog >= NONE) icons.push("fa-smog");
    return icons;
}

type Drop = { x: number; y: number; z: number };
type Flake = { x: number; y: number; z: number; phase: number; sway: number };
type Cloud = { x: number; y: number; width: number; speed: number; sprite: number; phase: number };

/** Particle counts at full strength on a 1080p screen, smaller screens get fewer */
const REFERENCE_AREA = 1920 * 1080;
const MAX_DROPS = 700;
const MAX_FLAKES = 450;
const CLOUDS = 7;

/**
 * Draws the weather on a canvas covering the screen. It eases into a new weather over
 * about two seconds and stops drawing once it is clear.
 */
export class WeatherRenderer {
    private context: CanvasRenderingContext2D;
    private width = 0;
    private height = 0;
    private shown: Weather = { ...CLEAR };
    private target: Weather = { ...CLEAR };
    private drops: Drop[] = [];
    private flakes: Flake[] = [];
    private clouds: Cloud[] = [];
    private sprites: HTMLCanvasElement[] = [];
    private flashes: { at: number; strength: number }[] = [];
    private frame = 0;
    private last = 0;
    private active = false;

    /**
     * Lite draws fewer particles, for phones. Calm (reduced motion) draws a still picture
     * without lightning.
     */
    constructor(
        private canvas: HTMLCanvasElement,
        private options: {
            lite: boolean;
            calm: boolean;
            /** Whether there is weather to draw, the canvas can go while there is none */
            on_active?: (active: boolean) => void;
        },
    ) {
        this.context = canvas.getContext("2d")!;
    }

    set(weather: Weather) {
        this.target = { ...weather };
        if (!is_clear(weather)) this.set_active(true);
        if (this.options.calm) {
            // A still picture, the particles spread over the screen
            this.shown = { ...weather };
            this.update(0, performance.now());
            for (const particle of [...this.drops, ...this.flakes]) {
                particle.y = Math.random() * this.height;
            }
            this.draw(performance.now());
            this.set_active(!is_clear(weather));
            return;
        }
        this.start();
    }

    /** A flash of lightning and a weaker one right after, while there is lightning */
    flash() {
        if (this.options.calm || !this.target.lightning) return;
        const now = performance.now();
        this.flashes.push({ at: now, strength: 0.55 }, { at: now + 140, strength: 0.35 });
        this.start();
    }

    private set_active(active: boolean) {
        if (this.active === active) return;
        this.active = active;
        this.options.on_active?.(active);
    }

    resize(width: number, height: number) {
        const scale = Math.min(devicePixelRatio || 1, this.options.lite ? 1.5 : 2);
        this.width = width;
        this.height = height;
        this.canvas.width = Math.round(width * scale);
        this.canvas.height = Math.round(height * scale);
        this.context.setTransform(scale, 0, 0, scale, 0, 0);
        for (const cloud of this.clouds) this.place_cloud(cloud, false);
        if (this.options.calm || !this.frame) this.draw(performance.now());
    }

    destroy() {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    private start() {
        if (this.frame) return;
        this.last = performance.now();
        this.frame = requestAnimationFrame(this.tick);
    }

    private tick = (now: number) => {
        // Long frames, e.g. after the tab was in the background, don't make it jump
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.ease(dt);
        this.update(dt, now);
        this.draw(now);
        // Nothing moves any more: the picture stays until the weather changes or it flashes
        if (this.settled()) {
            this.frame = 0;
            if (is_clear(this.shown) && is_clear(this.target)) {
                this.context.clearRect(0, 0, this.width, this.height);
                this.set_active(false);
            }
            return;
        }
        this.frame = requestAnimationFrame(this.tick);
    };

    private settled() {
        const eased = (["rain", "snow", "fog", "wind"] as const).every(
            (key) => Math.abs(this.shown[key] - this.target[key]) < 0.002,
        );
        return (
            eased &&
            !this.drops.length &&
            !this.flakes.length &&
            this.shown.fog < NONE &&
            !this.flashes.length
        );
    }

    private ease(dt: number) {
        const step = Math.min(1, dt * 1.5);
        for (const key of ["rain", "snow", "fog", "wind"] as const) {
            this.shown[key] += (this.target[key] - this.shown[key]) * step;
        }
        this.shown.lightning = this.target.lightning;
    }

    private count(max: number, amount: number) {
        const area = Math.min(1.5, Math.max(0.3, (this.width * this.height) / REFERENCE_AREA));
        return Math.round(max * amount * area * (this.options.lite ? 0.6 : 1));
    }

    private update(dt: number, now: number) {
        const { width, height } = this;
        const wind = this.shown.wind;

        // Rain falls fast and slanted by the wind, new drops start above the screen
        const drops = this.count(MAX_DROPS, this.shown.rain);
        while (this.drops.length < drops) {
            this.drops.push({
                x: Math.random() * width,
                y: -Math.random() * height,
                z: 0.4 + Math.random() * 0.6,
            });
        }
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];
            drop.y += (700 + 700 * drop.z) * dt;
            drop.x += wind * 500 * drop.z * dt;
            if (drop.y - 32 > height || drop.x < -60 || drop.x > width + 60) {
                // Fewer wanted: it falls out instead of starting again
                if (this.drops.length > drops) {
                    this.drops[i] = this.drops[this.drops.length - 1];
                    this.drops.pop();
                    continue;
                }
                drop.y = -Math.random() * 60;
                // Upwind, so it crosses the screen
                drop.x = Math.random() * (width + 120) - 60 - wind * 300;
            }
        }

        // Snow drifts down slowly and sways
        const flakes = this.count(MAX_FLAKES, this.shown.snow);
        while (this.flakes.length < flakes) {
            this.flakes.push({
                x: Math.random() * width,
                y: -Math.random() * height * 0.5,
                z: 0.3 + Math.random() * 0.7,
                phase: Math.random() * Math.PI * 2,
                sway: 8 + Math.random() * 22,
            });
        }
        const t = now / 1000;
        for (let i = this.flakes.length - 1; i >= 0; i--) {
            const flake = this.flakes[i];
            flake.y += (25 + 75 * flake.z) * dt;
            flake.x +=
                (wind * 140 * flake.z +
                    Math.cos(t * (0.6 + flake.z) + flake.phase) * flake.sway * 0.8) *
                dt;
            if (flake.x < -10) flake.x += width + 20;
            if (flake.x > width + 10) flake.x -= width + 20;
            if (flake.y - 4 > height) {
                if (this.flakes.length > flakes) {
                    this.flakes[i] = this.flakes[this.flakes.length - 1];
                    this.flakes.pop();
                    continue;
                }
                flake.y = -Math.random() * 20;
                flake.x = Math.random() * width;
            }
        }

        // Fog banks drift with the wind, slowly also without
        if (this.shown.fog >= NONE && !this.clouds.length) this.make_clouds();
        for (const cloud of this.clouds) {
            const drift = (wind === 0 ? 1 : Math.sign(wind)) * cloud.speed * (1 + Math.abs(wind) * 3);
            cloud.x += drift * dt;
            if (cloud.x > width) cloud.x = -cloud.width;
            if (cloud.x < -cloud.width) cloud.x = width;
        }

        this.flashes = this.flashes.filter((flash) => now - flash.at < 600);
    }

    private draw(now: number) {
        const { context: ctx, width, height, shown } = this;
        ctx.clearRect(0, 0, width, height);
        if (is_clear(shown) && !this.flashes.length) return;

        // Rain and storms darken the map, snow cools it
        const dark = shown.rain * 0.12 + (shown.lightning ? 0.1 : 0);
        if (dark > 0.005) {
            ctx.fillStyle = `rgba(12, 20, 34, ${dark})`;
            ctx.fillRect(0, 0, width, height);
        }
        if (shown.snow >= NONE) {
            ctx.fillStyle = `rgba(215, 228, 255, ${shown.snow * 0.06})`;
            ctx.fillRect(0, 0, width, height);
        }

        if (shown.fog >= NONE) {
            ctx.fillStyle = `rgba(200, 206, 216, ${shown.fog * 0.14})`;
            ctx.fillRect(0, 0, width, height);
            const t = now / 1000;
            for (const cloud of this.clouds) {
                ctx.globalAlpha =
                    shown.fog * 0.6 * (0.75 + 0.25 * Math.sin(t * 0.15 + cloud.phase));
                ctx.drawImage(
                    this.sprites[cloud.sprite],
                    cloud.x,
                    cloud.y,
                    cloud.width,
                    cloud.width * 0.45,
                );
            }
            ctx.globalAlpha = 1;
        }

        if (this.drops.length) {
            // Nearer drops are longer, brighter and wider, drawn in three batches
            const slant = shown.wind * 500;
            for (const [from, to, alpha, line] of [
                [0.4, 0.6, 0.16, 1],
                [0.6, 0.8, 0.26, 1.2],
                [0.8, 1.01, 0.38, 1.5],
            ]) {
                ctx.beginPath();
                for (const drop of this.drops) {
                    if (drop.z < from || drop.z >= to) continue;
                    const length = 10 + 22 * drop.z;
                    const speed = 700 + 700 * drop.z;
                    ctx.moveTo(drop.x, drop.y);
                    ctx.lineTo(
                        drop.x - ((slant * drop.z) / speed) * length,
                        drop.y - length,
                    );
                }
                ctx.strokeStyle = `rgba(190, 205, 228, ${alpha})`;
                ctx.lineWidth = line;
                ctx.stroke();
            }
        }

        if (this.flakes.length) {
            for (const [from, to, alpha] of [
                [0.3, 0.55, 0.5],
                [0.55, 0.8, 0.7],
                [0.8, 1.01, 0.9],
            ]) {
                ctx.beginPath();
                for (const flake of this.flakes) {
                    if (flake.z < from || flake.z >= to) continue;
                    const radius = 0.8 + 2.4 * flake.z;
                    ctx.moveTo(flake.x + radius, flake.y);
                    ctx.arc(flake.x, flake.y, radius, 0, Math.PI * 2);
                }
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();
            }
        }

        let flash = 0;
        for (const { at, strength } of this.flashes) {
            if (now >= at) flash += strength * Math.exp(-(now - at) / 90);
        }
        if (flash > 0.01) {
            ctx.fillStyle = `rgba(235, 240, 255, ${Math.min(0.8, flash)})`;
            ctx.fillRect(0, 0, width, height);
        }
    }

    /** Soft fog banks, drawn once and then only moved */
    private make_clouds() {
        if (!this.sprites.length) {
            for (let i = 0; i < 3; i++) this.sprites.push(cloud_sprite());
        }
        for (let i = 0; i < CLOUDS; i++) {
            const cloud = {
                x: 0,
                y: 0,
                width: 0,
                speed: 6 + Math.random() * 14,
                sprite: i % this.sprites.length,
                phase: Math.random() * Math.PI * 2,
            };
            this.place_cloud(cloud, true);
            this.clouds.push(cloud);
        }
    }

    private place_cloud(cloud: Cloud, anywhere: boolean) {
        cloud.width = this.width * (0.6 + Math.random() * 0.6);
        cloud.y = Math.random() * this.height - cloud.width * 0.2;
        if (anywhere || cloud.x > this.width) {
            cloud.x = Math.random() * (this.width + cloud.width) - cloud.width;
        }
    }
}

function cloud_sprite() {
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
        gradient.addColorStop(0, `rgba(235, 238, 244, ${0.18 + Math.random() * 0.12})`);
        gradient.addColorStop(1, "rgba(235, 238, 244, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    return canvas;
}
