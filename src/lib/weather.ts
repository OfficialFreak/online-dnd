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
/** One that `settles` stays on the top edge of the map if it comes down there */
type Flake = { x: number; y: number; z: number; phase: number; sway: number; settles: boolean };
type Cloud = { x: number; y: number; width: number; speed: number; sprite: number; phase: number };
/**
 * Where a raindrop hits the top edge of the map: droplets jumping up off it. `at` is where
 * along the edge, from 0 to 1, so it stays there while the map moves. `lean` sends them
 * more to one side, with the wind.
 */
type Splash = { at: number; size: number; age: number; life: number; lean: number };
/** The map's box on the screen */
export type MapBox = { left: number; top: number; right: number; bottom: number };
/** A flash of lightning while it shows, its bolt as x, y pairs in pixels */
type Strike = {
    flash: Flash;
    /** performance.now() when it struck */
    start: number;
    /** The bolt strikes again a few times, milliseconds after the start */
    strokes: { at: number; strength: number }[];
    /** Where across the screen it strikes, beside the map */
    x: number;
    trunk: number[];
    branches: number[][];
};

/** Particle counts at full strength on a 1080p screen, smaller screens get fewer */
const REFERENCE_AREA = 1920 * 1080;
const MAX_DROPS = 700;
const MAX_FLAKES = 450;
/** Raindrops splashing off the top edge of the map each second, along 1920 pixels of it */
const MAX_SPLASHES = 220;
/** The snow on the top edge of the map, how high it is at this many places along it */
const CAP_PLACES = 160;

/** How high snow lies on the map at most, in pixels, by how much it snows */
function cap_height(snow: number) {
    return 3 + 9 * snow;
}
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
    /**
     * The snow lying on the top edge of the map, in pixels high at CAP_PLACES places along
     * it. Piles up where flakes come down, evens out and melts once it stops snowing.
     */
    private cap = new Float32Array(CAP_PLACES);
    private capped = false;
    /** Where the map is this frame, only looked up while something needs it */
    private map: MapBox | null = null;
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
            /**
             * Where the map is on the screen: rain splashes off its top edge, snow settles
             * there, lightning strikes behind it
             */
            map?: () => MapBox | null;
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

    /** A flash of lightning, while there is lightning */
    flash(flash: Flash) {
        if (this.options.calm || !this.target.lightning) return;
        this.strikes.push(this.strike(flash));
        this.start();
    }

    /**
     * The bolt from the top of the screen down, jagged and with branches. Near ones reach
     * far down and flicker a few times, far ones stay small at the top, behind the clouds.
     * It strikes behind the map, beside it where there is room.
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
            x: this.beside(flash.x, this.options.map?.() ?? null),
            trunk: [],
            branches: [],
        };
        if (!flash.bolt) return strike;

        const { width, height } = this;
        const reach = height * (0.18 + near * 0.62 + next() * 0.15);
        const step = Math.max(7, Math.min(width, height) / 45) * (0.55 + near * 0.6);
        // Leans a little to one side as a whole
        const lean = (next() - 0.5) * 0.7;
        let x = strike.x;
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

    /**
     * Where across the screen, from `at` 0 to 1, in the room left and right of the map.
     * Without enough of it anywhere across, it shows only above the map.
     */
    private beside(at: number, map: MapBox | null) {
        const { width } = this;
        if (!map) return at * width;
        const left = Math.max(0, Math.min(width, map.left));
        const right = Math.max(0, Math.min(width, width - map.right));
        if (left + right < 40) return at * width;
        const spot = at * (left + right);
        return spot < left ? spot : width - right + (spot - left);
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
            !this.capped &&
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

        // The map only while something needs it, looking costs a layout when it moved
        const raining = this.shown.rain >= NONE ? this.shown.rain : 0;
        const snowing = this.shown.snow >= NONE ? this.shown.snow : 0;
        const map = (this.map =
            raining || snowing || this.capped || this.strikes.length
                ? (this.options.map?.() ?? null)
                : null);
        const span = map ? map.right - map.left : 0;

        // The rain splashes up off the top edge of the map, like on the cards of a weather
        // app, and nowhere else: splashes all over the screen looked like noise
        const left = Math.max(0, map?.left ?? 0);
        const right = Math.min(width, map?.right ?? 0);
        if (map && raining && map.top >= 0 && map.top <= height && right > left) {
            this.splashes_due +=
                MAX_SPLASHES *
                raining *
                ((right - left) / 1920) *
                (this.options.lite ? 0.6 : 1) *
                dt;
        } else {
            this.splashes_due = 0;
        }
        while (this.splashes_due >= 1 && map) {
            this.splashes_due--;
            this.splashes.push({
                at: (left + Math.random() * (right - left) - map.left) / span,
                size: 3 + Math.random() * 5,
                age: 0,
                life: 0.3 + Math.random() * 0.25,
                lean: wind * 0.6 + (Math.random() - 0.5) * 0.5,
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

        // Snow drifts down slowly and sways. Some flakes settle on the top edge of the
        // map, the snow there piles up, the others drift on over the map.
        const flakes = this.count(MAX_FLAKES, this.shown.snow);
        while (this.flakes.length < flakes) {
            this.flakes.push({
                x: Math.random() * width,
                y: -Math.random() * height * 0.5,
                z: 0.3 + Math.random() * 0.7,
                phase: Math.random() * Math.PI * 2,
                sway: 8 + Math.random() * 22,
                settles: Math.random() < 0.4,
            });
        }
        const t = now / 1000;
        for (let i = this.flakes.length - 1; i >= 0; i--) {
            const flake = this.flakes[i];
            const before = flake.y;
            flake.y += (25 + 75 * flake.z) * dt;
            flake.x +=
                (wind * 140 * flake.z +
                    Math.cos(t * (0.6 + flake.z) + flake.phase) * flake.sway * 0.8) *
                dt;
            if (flake.x < -10) flake.x += width + 20;
            if (flake.x > width + 10) flake.x -= width + 20;
            let landed = false;
            if (flake.settles && map && snowing && span > 0) {
                const place = Math.floor(((flake.x - map.left) / span) * CAP_PLACES);
                if (place >= 0 && place < CAP_PLACES) {
                    const surface = map.top - this.cap[place];
                    landed = before < surface && flake.y >= surface;
                    if (landed) this.pile(place, span, snowing);
                }
            }
            if (landed || flake.y - 4 > height) {
                if (this.flakes.length > flakes) {
                    this.flakes[i] = this.flakes[this.flakes.length - 1];
                    this.flakes.pop();
                    continue;
                }
                flake.y = -Math.random() * 20;
                flake.x = Math.random() * width;
                flake.settles = Math.random() < 0.4;
            }
        }
        if (this.capped) this.settle_cap(dt, snowing);

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
        if (is_clear(shown) && !this.strikes.length && !this.splashes.length && !this.capped) {
            return;
        }

        // The bolts behind everything else, far ones veiled by the fog, and behind the
        // map: only in the light around it
        if (this.strikes.some((strike) => strike.flash.bolt)) {
            this.behind_map(() => {
                for (const strike of this.strikes) {
                    if (strike.flash.bolt) this.draw_bolt(strike, this.light(strike, now));
                }
            });
        }

        if (shown.fog >= NONE) {
            if (this.options.calm || now - this.fog_drawn >= 30) this.draw_fog(now);
            ctx.drawImage(this.fog_layer!, 0, 0, width, height);
        }

        this.draw_cap();

        const map = this.map;
        if (this.splashes.length && map) {
            // A small crown flung up where the drop hits the edge, only at first
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const splash of this.splashes) {
                const age = splash.age / splash.life;
                if (age >= 0.3) continue;
                const reach = splash.size * (0.4 + 2 * age);
                const [x, y] = this.on_edge(map, splash.at);
                const { lean } = splash;
                ctx.moveTo(x - reach * 0.25, y);
                ctx.lineTo(x - reach * (0.8 - lean * 0.4), y - reach * 0.9);
                ctx.moveTo(x + reach * 0.25, y);
                ctx.lineTo(x + reach * (0.8 + lean * 0.4), y - reach * 0.9);
            }
            ctx.strokeStyle = "rgba(210, 222, 242, 0.55)";
            ctx.stroke();
            // Droplets jumping up off the edge and falling back onto it, fainter as they go
            for (const [from, to, alpha] of [
                [0, 0.5, 0.7],
                [0.5, 1.01, 0.4],
            ]) {
                ctx.beginPath();
                for (const splash of this.splashes) {
                    const age = splash.age / splash.life;
                    if (age < from || age >= to) continue;
                    const rise = 4 * age * (1 - age) * splash.size * 1.5;
                    const out = age * splash.size * 1.3;
                    const size = 1 + splash.size * 0.16;
                    const [x, y] = this.on_edge(map, splash.at);
                    const { lean } = splash;
                    ctx.rect(x - out * (1 - lean), y - rise * 0.8 - size, size, size);
                    ctx.rect(x + out * (1 + lean), y - rise - size, size, size);
                    ctx.rect(x + out * lean * 0.4, y - rise * 1.35 - size, size, size);
                }
                ctx.fillStyle = `rgba(215, 226, 245, ${alpha})`;
                ctx.fill();
            }
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

        // The light of the flashes, from above where it struck: near ones light up all
        // around the map, far ones only the sky at the top. Behind the map like the bolts,
        // the map itself stays as it is.
        if (this.strikes.length) {
            this.behind_map(() => {
                for (const strike of this.strikes) {
                    const near = 1 - strike.flash.distance;
                    const light =
                        this.light(strike, now) *
                        (strike.flash.bolt ? 0.12 + near * 0.5 : 0.15 + near * 0.35);
                    if (light < 0.01) continue;
                    const reach = Math.hypot(width, height) * (0.45 + near * 0.9);
                    const glow = ctx.createRadialGradient(strike.x, 0, 0, strike.x, 0, reach);
                    const brightest = Math.min(0.8, light);
                    glow.addColorStop(0, `rgba(235, 240, 255, ${brightest})`);
                    glow.addColorStop(1, `rgba(235, 240, 255, ${brightest * near * 0.4})`);
                    ctx.fillStyle = glow;
                    ctx.fillRect(0, 0, width, height);
                }
            });
        }
    }

    /** Paints only where the map isn't, as if behind it */
    private behind_map(paint: () => void) {
        const ctx = this.context;
        const map = this.map;
        ctx.save();
        if (map) {
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.rect(map.left, map.top, map.right - map.left, map.bottom - map.top);
            ctx.clip("evenodd");
        }
        paint();
        ctx.restore();
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

    /** Where along the top edge of the map `at` is, on the snow lying there */
    private on_edge(map: MapBox, at: number): [number, number] {
        const place = Math.min(CAP_PLACES - 1, Math.max(0, Math.floor(at * CAP_PLACES)));
        return [map.left + at * (map.right - map.left), map.top - this.cap[place] * this.taper(place, map)];
    }

    /** Lower towards the corners of the map, the snow rounds off over them */
    private taper(place: number, map: MapBox) {
        const step = (map.right - map.left) / CAP_PLACES;
        return Math.min(1, (Math.min(place + 0.5, CAP_PLACES - place - 0.5) * step) / 10);
    }

    /**
     * A flake comes down on the snow at `place`: a little heap about as wide as a finger,
     * the same on a map shown small or large, lower the higher the snow already is
     */
    private pile(place: number, span: number, snowing: number) {
        const step = span / CAP_PLACES;
        const reach = Math.max(1, Math.round(16 / step));
        const high = cap_height(snowing);
        for (let i = -reach; i <= reach; i++) {
            const at = place + i;
            if (at < 0 || at >= CAP_PLACES) continue;
            const room = Math.max(0, 1 - this.cap[at] / high);
            this.cap[at] += 3.3 * room * (1 - Math.abs(i) / (reach + 1));
        }
        this.capped = true;
    }

    /** The snow on the map evens out, and melts once it stops snowing or snows less */
    private settle_cap(dt: number, snowing: number) {
        const cap = this.cap;
        const high = cap_height(snowing);
        const even = Math.min(0.24, dt * 1.2);
        let before = cap[0];
        let any = false;
        for (let i = 0; i < CAP_PLACES; i++) {
            const here = cap[i];
            const after = i + 1 < CAP_PLACES ? cap[i + 1] : here;
            let next = here + even * (before + after - 2 * here);
            if (!snowing) next -= dt * 0.5;
            else if (next > high) next -= dt * 0.3;
            cap[i] = Math.max(0, next);
            before = here;
            any ||= cap[i] > 0.05;
        }
        this.capped = any;
    }

    /** The snow lying on the top edge of the map, a soft white ridge on it */
    private draw_cap() {
        const map = this.map;
        if (!map || !this.capped || map.top < -20 || map.top > this.height + 20) return;
        const ctx = this.context;
        const step = (map.right - map.left) / CAP_PLACES;
        // Only the places on the screen
        const first = Math.max(0, Math.floor(-map.left / step) - 1);
        const last = Math.min(CAP_PLACES - 1, Math.ceil((this.width - map.left) / step) + 1);
        if (first > last) return;
        ctx.beginPath();
        ctx.moveTo(map.left + first * step, map.top + 1);
        let [x, y] = [map.left + (first + 0.5) * step, map.top - this.cap[first] * this.taper(first, map)];
        ctx.lineTo(x, y);
        // Through the middles between the places, rounded
        for (let i = first + 1; i <= last; i++) {
            const nx = map.left + (i + 0.5) * step;
            const ny = map.top - this.cap[i] * this.taper(i, map);
            ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
            [x, y] = [nx, ny];
        }
        ctx.lineTo(x, y);
        ctx.lineTo(map.left + (last + 1) * step, map.top + 1);
        ctx.closePath();
        const shade = ctx.createLinearGradient(0, map.top - cap_height(1), 0, map.top + 1);
        shade.addColorStop(0, "rgba(255, 255, 255, 0.97)");
        shade.addColorStop(1, "rgba(214, 226, 244, 0.95)");
        ctx.fillStyle = shade;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(170, 188, 215, 0.45)";
        ctx.stroke();
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
