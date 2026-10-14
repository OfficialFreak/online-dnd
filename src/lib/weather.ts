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
 * How many flashes come in a minute on average, by the DM's `lightning_rate`: from one
 * every 80 seconds to one every four or so, one every 13 seconds by default as before
 * there was a rate
 */
export function flashes_per_minute(rate: number | null | undefined) {
    const value = rate != null && Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0.5;
    return 4.5 * (value < 0.5 ? 6 : 3) ** (2 * value - 1);
}

export type Flash = {
    /** In milliseconds since 1970 */
    at: number;
    /** From 0 right overhead to 1 far off: near ones are brighter, louder and sooner */
    distance: number;
    thunder_delay: number;
    loudness: number;
    /** A bolt to see, else only the clouds light up from within */
    bolt: boolean;
    /** Where across the screen it strikes, from 0 to 1 */
    x: number;
    /** For the shape of the bolt and its flickering, the same on every screen */
    seed: number;
    /** Which of the thunders rolls after it, from 0 to 1 */
    pick: number;
};

/**
 * The flashes after `from` until `to`, in milliseconds since 1970. They come from the
 * clock, so every screen flashes at the same moment without the server, with the same
 * bolt and the same thunder.
 */
export function flashes_between(from: number, to: number, rate?: number | null) {
    // A flash in six of ten windows, the windows as long as that makes the rate. At the
    // default rate 8 seconds long, as before there was a rate: older clients flash at
    // the same moments.
    const span = Math.round((60000 / flashes_per_minute(rate)) * 0.6);
    const flashes: Flash[] = [];
    for (let slot = Math.floor(from / span); slot <= Math.floor(to / span); slot++) {
        const next = seeded(slot);
        if (next() > 0.6) continue;
        const at = slot * span + next() * span;
        if (at <= from || at > to) continue;
        // Close storms thunder soon and loud, far ones later and quieter
        const distance = next();
        flashes.push({
            at,
            distance,
            thunder_delay: 400 + distance * 3200,
            loudness: (1 - distance * 0.55) * (0.75 + next() * 0.25),
            // Far off it is more often only a glow in the clouds
            bolt: next() < 0.9 - distance * 0.55,
            x: 0.06 + next() * 0.88,
            seed: Math.floor(next() * 2 ** 31),
            pick: next(),
        });
    }
    return flashes;
}

/** The thunders a flash picks from, also of scenes from before there were several */
export function thunder_files(weather: Weather | null | undefined) {
    if (weather?.thunders?.length) return weather.thunders;
    return weather?.thunder ? [weather.thunder] : [];
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

/** The strokes a bolt is drawn with, from the glow to the core: width, colour, strength */
const BOLT_STROKES = [
    [24, "110, 130, 255", 0.09],
    [10, "150, 170, 255", 0.22],
    [3.4, "205, 218, 255", 0.6],
    [1.4, "255, 255, 255", 1],
] as const;

/** A line through x, y pairs into the current path */
function trace(ctx: CanvasRenderingContext2D, points: number[]) {
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
}

/**
 * A branch off a bolt into `branches`, to one side and petering out, from the trunk now
 * and then branching once more
 */
function branch(
    next: () => number,
    x: number,
    y: number,
    step: number,
    room: number,
    lean: number,
    branches: number[][],
    again: boolean,
) {
    const side = next() < 0.5 ? -1 : 1;
    const end = y + room * (0.2 + next() * 0.5);
    const points = [x, y];
    branches.push(points);
    while (y < end) {
        y += step * (0.4 + next() * 0.8);
        x += (side * (0.4 + next() * 0.7) + lean * 0.5 + (next() - 0.5) * 1.2) * step;
        points.push(x, y);
        if (again && next() < 0.08) {
            branch(next, x, y, step * 0.8, (end - y) * 0.9, lean, branches, false);
        }
    }
}

type Drop = { x: number; y: number; z: number };
/** `land` is where on the screen it comes down on the map, below it if it falls on */
type Flake = { x: number; y: number; z: number; phase: number; sway: number; land: number };
type Cloud = { x: number; y: number; width: number; speed: number; sprite: number; phase: number };
/** Where a raindrop hits the map: a ring spreading out and a few droplets jumping up */
type Splash = { x: number; y: number; size: number; age: number; life: number };
/** A flake that came down and lies there until it melts, ages in seconds */
type Lying = { x: number; y: number; radius: number; age: number; life: number };
/** A flash of lightning while it shows, its bolt as x, y pairs in pixels */
type Strike = {
    flash: Flash;
    /** performance.now() when it struck */
    start: number;
    /** The bolt strikes again a few times, milliseconds after the start */
    strokes: { at: number; strength: number }[];
    trunk: number[];
    branches: number[][];
};

/** Particle counts at full strength on a 1080p screen, smaller screens get fewer */
const REFERENCE_AREA = 1920 * 1080;
const MAX_DROPS = 700;
const MAX_FLAKES = 450;
/** Raindrops hitting the map each second */
const MAX_SPLASHES = 650;
/** Flakes lying on the map at most, also in a long blizzard */
const MAX_LYING = 900;
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
    /** The colour behind the drops, see tint */
    private tinted = "";
    private drops: Drop[] = [];
    private flakes: Flake[] = [];
    private clouds: Cloud[] = [];
    private sprites: HTMLCanvasElement[] = [];
    private splashes: Splash[] = [];
    /** Splashes owed from the last frames, a frame mostly brings only a part of one */
    private splashes_due = 0;
    private lying: Lying[] = [];
    /**
     * How much snow lies, from 0 to the snow's strength: it piles up over a minute or so
     * and melts away a little faster. The longer it snows, the longer flakes stay lying
     * and the frostier the edges of the screen.
     */
    private cover = 0;
    /** The frost at the edges, see frost */
    private frosted = "";
    private strikes: Strike[] = [];
    private frame = 0;
    /** The pause between frames while only fog drifts, see tick */
    private wait = 0;
    private last = 0;
    private active = false;
    /**
     * The fog at half the size, drawn about thirty times a second. Seven clouds over the
     * whole screen on every frame were four and a half screens of pixels each time, as
     * much as heavy rain, for something that hardly moves.
     */
    private fog_layer: HTMLCanvasElement | null = null;
    private fog_drawn = -Infinity;

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
            this.cover = weather.snow;
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

    /** A flash of lightning, while there is lightning */
    flash(flash: Flash) {
        if (this.options.calm || !this.target.lightning) return;
        this.strikes.push(this.strike(flash));
        this.start();
    }

    /**
     * The bolt from the top of the screen down, jagged and with branches. Near ones reach
     * far down and flicker a few times, far ones stay small at the top, behind the clouds.
     */
    private strike(flash: Flash): Strike {
        const next = seeded(flash.seed);
        const near = 1 - flash.distance;
        const strokes = [{ at: 0, strength: 1 }];
        const restrikes = Math.floor(next() * (1 + near * 2.6));
        for (let i = 0; i < restrikes; i++) {
            strokes.push({
                at: strokes[strokes.length - 1].at + 50 + next() * 130,
                strength: 0.45 + next() * 0.5,
            });
        }
        const strike: Strike = {
            flash,
            start: performance.now(),
            strokes,
            trunk: [],
            branches: [],
        };
        if (!flash.bolt) return strike;

        const { width, height } = this;
        const reach = height * (0.18 + near * 0.62 + next() * 0.15);
        const step = Math.max(7, Math.min(width, height) / 45) * (0.55 + near * 0.6);
        // Leans a little to one side as a whole
        const lean = (next() - 0.5) * 0.7;
        let x = flash.x * width;
        let y = -10;
        strike.trunk.push(x, y);
        while (y < reach) {
            y += step * (0.5 + next() * 0.9);
            x += (lean + (next() - 0.5) * 1.7) * step;
            strike.trunk.push(x, y);
            if (y < reach * 0.85 && next() < 0.05 + near * 0.08) {
                branch(next, x, y, step * 0.75, (reach - y) * 0.8, lean, strike.branches, true);
            }
        }
        return strike;
    }

    private set_active(active: boolean) {
        if (this.active === active) return;
        this.active = active;
        this.options.on_active?.(active);
    }

    /**
     * Rain and storms darken the map, snow cools it and fog pales it: one colour behind the
     * drops, set on the canvas as its background. Filled into the canvas on every frame it
     * was a whole screen of pixels each time, which Firefox drew and sent along slowly.
     */
    private tint(shown: Weather) {
        let [red, green, blue, alpha] = [0, 0, 0, 0];
        const over = (r: number, g: number, b: number, a: number) => {
            if (a <= 0) return;
            const together = a + alpha * (1 - a);
            red = (r * a + red * alpha * (1 - a)) / together;
            green = (g * a + green * alpha * (1 - a)) / together;
            blue = (b * a + blue * alpha * (1 - a)) / together;
            alpha = together;
        };
        over(12, 20, 34, shown.rain * 0.12 + (shown.lightning ? 0.1 : 0));
        if (shown.snow >= NONE) over(215, 228, 255, shown.snow * 0.06);
        if (shown.fog >= NONE) over(200, 206, 216, shown.fog * 0.14);
        const colour =
            alpha > 0.005
                ? `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${alpha.toFixed(3)})`
                : "transparent";
        if (colour !== this.tinted) {
            this.tinted = colour;
            this.canvas.style.backgroundColor = colour;
        }
    }

    resize(width: number, height: number) {
        // A pixel of the canvas for each of the page, also on sharp screens: rain is a blur
        // in motion, and four times the pixels each frame made Firefox stutter
        const scale = Math.min(devicePixelRatio || 1, 1);
        this.width = width;
        this.height = height;
        this.canvas.width = Math.round(width * scale);
        this.canvas.height = Math.round(height * scale);
        this.context.setTransform(scale, 0, 0, scale, 0, 0);
        for (const cloud of this.clouds) this.place_cloud(cloud, false);
        this.fog_drawn = -Infinity;
        if (this.options.calm || !this.frame) this.draw(performance.now());
    }

    destroy() {
        cancelAnimationFrame(this.frame);
        clearTimeout(this.wait);
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
        if (
            this.drops.length ||
            this.flakes.length ||
            this.splashes.length ||
            this.lying.length ||
            this.strikes.length
        ) {
            this.frame = requestAnimationFrame(this.tick);
        } else {
            // Only fog drifts, drawn about thirty times a second anyway: the frames in
            // between would only copy it. Not 0 meanwhile, start() would run a second loop.
            this.frame = -1;
            this.wait = window.setTimeout(() => {
                this.frame = requestAnimationFrame(this.tick);
            }, 28);
        }
    };

    private settled() {
        const eased = (["rain", "snow", "fog", "wind"] as const).every(
            (key) => Math.abs(this.shown[key] - this.target[key]) < 0.002,
        );
        return (
            eased &&
            !this.drops.length &&
            !this.flakes.length &&
            !this.splashes.length &&
            !this.lying.length &&
            this.cover < 0.002 &&
            this.shown.fog < NONE &&
            !this.strikes.length
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

        // Rain falls fast and slanted by the wind, new drops start above the screen. As
        // far upwind as the wind carries a drop down the whole screen: a fixed distance
        // left the corners of a tall phone screen dry, one where none started, the other
        // where none arrived.
        const slant = (wind * 500) / 1400;
        const drift = slant * (height + 92);
        const band = width + 120 + Math.abs(drift);
        const start_x = () => -60 - Math.max(0, drift) + Math.random() * band;
        const drops = Math.round(this.count(MAX_DROPS, this.shown.rain) * Math.min(2.5, band / (width + 120)));
        while (this.drops.length < drops) {
            this.drops.push({
                x: start_x(),
                y: -Math.random() * height,
                z: 0.4 + Math.random() * 0.6,
            });
        }
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];
            drop.y += (700 + 700 * drop.z) * dt;
            drop.x += wind * 500 * drop.z * dt;
            // Out only on the side the wind blows to, upwind it is still coming in
            const out = wind >= 0 ? drop.x > width + 60 : drop.x < -60;
            if (drop.y - 32 > height || out) {
                // Fewer wanted: it falls out instead of starting again
                if (this.drops.length > drops) {
                    this.drops[i] = this.drops[this.drops.length - 1];
                    this.drops.pop();
                    continue;
                }
                drop.y = -Math.random() * 60;
                drop.x = start_x();
            }
        }

        // Where the rain hits the map it splashes
        const raining = this.shown.rain >= NONE ? this.shown.rain : 0;
        this.splashes_due += this.count(MAX_SPLASHES, raining) * dt;
        while (this.splashes_due >= 1) {
            this.splashes_due--;
            this.splashes.push({
                x: Math.random() * width,
                y: Math.random() * height,
                size: 2.5 + Math.random() * 5,
                age: 0,
                life: 0.28 + Math.random() * 0.22,
            });
        }
        for (let i = this.splashes.length - 1; i >= 0; i--) {
            const splash = this.splashes[i];
            splash.age += dt;
            if (splash.age >= splash.life) {
                this.splashes[i] = this.splashes[this.splashes.length - 1];
                this.splashes.pop();
            }
        }

        // Snow drifts down slowly and sways. Most flakes come down on the map somewhere
        // and lie there a while, the others drift on out of the screen.
        const snowing = this.shown.snow >= NONE ? this.shown.snow : 0;
        this.cover =
            this.cover < snowing
                ? Math.min(snowing, this.cover + dt * 0.02)
                : Math.max(snowing, this.cover - dt * 0.05);
        const land = () => (Math.random() < 0.6 ? height * (0.04 + Math.random()) : Infinity);
        const flakes = this.count(MAX_FLAKES, this.shown.snow);
        const lying = this.count(MAX_LYING, 1);
        while (this.flakes.length < flakes) {
            this.flakes.push({
                x: Math.random() * width,
                y: -Math.random() * height * 0.5,
                z: 0.3 + Math.random() * 0.7,
                phase: Math.random() * Math.PI * 2,
                sway: 8 + Math.random() * 22,
                land: land(),
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
            const landed = flake.y >= flake.land;
            if (landed && this.lying.length < lying) {
                // The longer it snows, the longer it stays before it melts
                this.lying.push({
                    x: flake.x,
                    y: flake.y,
                    radius: 0.8 + 2.4 * flake.z,
                    age: 0,
                    life: (3 + Math.random() * 3) * (1 + this.cover * 7),
                });
            }
            if (landed || flake.y - 4 > height) {
                if (this.flakes.length > flakes) {
                    this.flakes[i] = this.flakes[this.flakes.length - 1];
                    this.flakes.pop();
                    continue;
                }
                flake.y = -Math.random() * 20;
                flake.x = Math.random() * width;
                flake.land = land();
            }
        }
        // Once it stops snowing it melts faster
        const melt = snowing ? 1 : 2.5;
        for (let i = this.lying.length - 1; i >= 0; i--) {
            const flake = this.lying[i];
            flake.age += dt * melt;
            if (flake.age >= flake.life) {
                this.lying[i] = this.lying[this.lying.length - 1];
                this.lying.pop();
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

        if (this.strikes.length) {
            this.strikes = this.strikes.filter(
                (strike) => now - strike.start < strike.strokes[strike.strokes.length - 1].at + 900,
            );
        }
    }

    private draw(now: number) {
        const { context: ctx, width, height, shown } = this;
        ctx.clearRect(0, 0, width, height);
        this.tint(shown);
        this.frost();
        if (
            is_clear(shown) &&
            !this.strikes.length &&
            !this.splashes.length &&
            !this.lying.length
        ) {
            return;
        }

        // The bolts behind everything else, far ones veiled by the fog
        for (const strike of this.strikes) {
            if (strike.flash.bolt) this.draw_bolt(strike, this.light(strike, now));
        }

        if (shown.fog >= NONE) {
            if (this.options.calm || now - this.fog_drawn >= 30) this.draw_fog(now);
            ctx.drawImage(this.fog_layer!, 0, 0, width, height);
        }

        if (this.lying.length) {
            // Flat on the map, smaller and fainter as they melt
            for (const [from, to, alpha] of [
                [0, 0.34, 0.25],
                [0.34, 0.67, 0.5],
                [0.67, 1.01, 0.8],
            ]) {
                ctx.beginPath();
                for (const flake of this.lying) {
                    const left = Math.min(1, ((flake.life - flake.age) / flake.life) * 3.5);
                    if (left < from || left >= to) continue;
                    const radius = flake.radius * (0.55 + 0.45 * left);
                    ctx.moveTo(flake.x + radius, flake.y);
                    ctx.ellipse(flake.x, flake.y, radius, radius * 0.7, 0, 0, Math.PI * 2);
                }
                ctx.fillStyle = `rgba(240, 246, 255, ${alpha})`;
                ctx.fill();
            }
        }

        if (this.splashes.length) {
            // A ring spreading out flat on the map, fading as it grows
            ctx.lineWidth = 1;
            for (const [from, to, alpha] of [
                [0, 0.34, 0.55],
                [0.34, 0.67, 0.32],
                [0.67, 1.01, 0.14],
            ]) {
                ctx.beginPath();
                for (const splash of this.splashes) {
                    const age = splash.age / splash.life;
                    if (age < from || age >= to) continue;
                    const radius = splash.size * (0.25 + 0.75 * Math.sqrt(age));
                    ctx.moveTo(splash.x + radius, splash.y);
                    ctx.ellipse(splash.x, splash.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
                }
                ctx.strokeStyle = `rgba(200, 214, 235, ${alpha})`;
                ctx.stroke();
            }
            // Two droplets jumping up and falling back, in the first half
            ctx.beginPath();
            for (const splash of this.splashes) {
                const age = (splash.age / splash.life) * 2;
                if (age >= 1) continue;
                const rise = Math.sin(age * Math.PI) * splash.size;
                const spread = age * splash.size * 1.1;
                const size = 0.7 + splash.size * 0.12;
                ctx.rect(splash.x - spread, splash.y - rise * 0.9, size, size);
                ctx.rect(splash.x + spread * 0.8, splash.y - rise * 1.2, size, size);
            }
            ctx.fillStyle = "rgba(215, 226, 245, 0.6)";
            ctx.fill();
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

        // The light of the flashes, from above where it struck: near ones light up the
        // whole screen, far ones only the sky at the top
        for (const strike of this.strikes) {
            const near = 1 - strike.flash.distance;
            const light =
                this.light(strike, now) *
                (strike.flash.bolt ? 0.12 + near * 0.5 : 0.15 + near * 0.35);
            if (light < 0.01) continue;
            const x = strike.flash.x * width;
            const reach = Math.hypot(width, height) * (0.45 + near * 0.9);
            const glow = ctx.createRadialGradient(x, 0, 0, x, 0, reach);
            const brightest = Math.min(0.8, light);
            glow.addColorStop(0, `rgba(235, 240, 255, ${brightest})`);
            glow.addColorStop(1, `rgba(235, 240, 255, ${brightest * near * 0.4})`);
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, width, height);
        }
    }

    /** How bright a flash is now, each stroke flaring up and dying away */
    private light(strike: Strike, now: number) {
        const since = now - strike.start;
        // Glowing in the clouds it fades slower than a bolt
        const fade = strike.flash.bolt ? 75 : 150;
        let light = 0;
        for (const stroke of strike.strokes) {
            if (since >= stroke.at) light += stroke.strength * Math.exp(-(since - stroke.at) / fade);
        }
        return Math.min(1, light);
    }

    /** A wide faint glow and a bright core on it, shadows cost too much while it flickers */
    private draw_bolt(strike: Strike, light: number) {
        const near = 1 - strike.flash.distance;
        const alpha = light * (0.4 + near * 0.6);
        if (alpha < 0.02) return;
        const ctx = this.context;
        const scale = 0.45 + near * 0.75;
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (const [line, colour, strength] of BOLT_STROKES) {
            ctx.lineWidth = line * scale;
            ctx.strokeStyle = `rgba(${colour}, ${strength * alpha})`;
            ctx.beginPath();
            trace(ctx, strike.trunk);
            ctx.stroke();
            if (!strike.branches.length) continue;
            // Branches thinner and fainter, gone before the trunk
            ctx.lineWidth = line * scale * 0.5;
            ctx.strokeStyle = `rgba(${colour}, ${strength * alpha * alpha * 0.8})`;
            ctx.beginPath();
            for (const branch of strike.branches) trace(ctx, branch);
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Snow that has been lying a while frosts the edges of the screen, thicker in the
     * corners. A background like the tint, the graphics card only puts it on.
     */
    private frost() {
        const strength = Math.round(this.cover * 30) / 100;
        const colour = (alpha: number) => `rgba(236, 243, 255, ${alpha.toFixed(3)})`;
        const frost =
            strength > 0
                ? [
                      `radial-gradient(ellipse 45% 40% at 0% 0%, ${colour(strength)}, transparent)`,
                      `radial-gradient(ellipse 40% 45% at 100% 100%, ${colour(strength)}, transparent)`,
                      `radial-gradient(ellipse 35% 35% at 100% 0%, ${colour(strength * 0.7)}, transparent)`,
                      `radial-gradient(ellipse 35% 40% at 0% 100%, ${colour(strength * 0.8)}, transparent)`,
                      `radial-gradient(ellipse at center, transparent 60%, ${colour(strength * 0.6)})`,
                  ].join(", ")
                : "none";
        if (frost !== this.frosted) {
            this.frosted = frost;
            this.canvas.style.backgroundImage = frost;
        }
    }

    /** Soft fog banks, drawn once and then only moved */
    /** The clouds into the fog layer, see fog_layer */
    private draw_fog(now: number) {
        this.fog_drawn = now;
        const layer = (this.fog_layer ??= document.createElement("canvas"));
        const width = Math.max(1, Math.ceil(this.width / 2));
        const height = Math.max(1, Math.ceil(this.height / 2));
        if (layer.width !== width || layer.height !== height) {
            layer.width = width;
            layer.height = height;
        }
        const fog = layer.getContext("2d")!;
        fog.setTransform(1, 0, 0, 1, 0, 0);
        fog.clearRect(0, 0, width, height);
        fog.setTransform(width / Math.max(1, this.width), 0, 0, height / Math.max(1, this.height), 0, 0);
        const t = now / 1000;
        for (const cloud of this.clouds) {
            fog.globalAlpha =
                this.shown.fog * 0.6 * (0.75 + 0.25 * Math.sin(t * 0.15 + cloud.phase));
            fog.drawImage(
                this.sprites[cloud.sprite],
                cloud.x,
                cloud.y,
                cloud.width,
                cloud.width * 0.45,
            );
        }
        fog.globalAlpha = 1;
    }

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
