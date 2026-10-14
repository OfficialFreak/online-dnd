/**
 * The bottom edge of the map: rain runs off it and drips down into the light around the
 * map, blood rain too. While it snows icicles grow there, they drip once it stops.
 */
import { drop_at, NONE, seeded, type Frame } from "$lib/weather-common";

/**
 * A drop hanging under the edge until it is heavy enough, at `at` along it from 0 to 1,
 * then falling on its own. `red` is how much of it is blood.
 */
type Drip = {
    at: number;
    x: number;
    y: number;
    size: number;
    /** How far below the edge it hangs, at an icicle's tip */
    tip: number;
    /** Seconds it hangs before it falls */
    hang: number;
    age: number;
    speed: number;
    falling: boolean;
    red: number;
};

/** An icicle at `at` along the edge, `length` in pixels growing to `longest` */
type Icicle = { at: number; length: number; longest: number; width: number };

/** Drops running off the edge each second at full rain, along 1920 pixels of it */
const MAX_DRIPS = 26;
const ICICLES = 70;

export class Edges {
    private drips: Drip[] = [];
    private due = 0;
    private icicles: Icicle[] = [];
    private iced = false;

    /**
     * `water` is how hard it rains, `red` how much of it is blood, `cold` how much it
     * snows
     */
    update(frame: Frame, water: number, red: number, cold: number) {
        const { map, dt, width, height } = frame;
        const span = map ? map.right - map.left : 0;
        const left = Math.max(0, map?.left ?? 0);
        const right = Math.min(width, map?.right ?? 0);
        const seen = map && map.bottom >= 0 && map.bottom <= height && right > left;

        if (seen && water >= NONE) {
            this.due += MAX_DRIPS * water * ((right - left) / 1920) * (frame.lite ? 0.6 : 1) * dt;
        } else {
            this.due = 0;
        }
        while (this.due >= 1 && map) {
            this.due--;
            this.drip((left + Math.random() * (right - left) - map.left) / span, 1.4 + Math.random() * 1.8, red);
        }

        // Icicles grow over about a minute while it snows, shrink and drip once it stops
        if (cold >= NONE && !this.icicles.length) this.make_icicles();
        let iced = false;
        for (const icicle of this.icicles) {
            const longest = icicle.longest * (0.5 + 0.5 * cold);
            if (cold >= NONE && icicle.length < longest) {
                icicle.length = Math.min(longest, icicle.length + (dt * longest) / 55);
            } else if (cold < NONE && icicle.length > 0) {
                icicle.length = Math.max(0, icicle.length - dt * 1.1);
                if (seen && icicle.length > 2 && Math.random() < dt * 0.35) {
                    this.drip(icicle.at, 1 + Math.random() * 0.8, 0, icicle.length);
                }
            }
            iced ||= icicle.length > 0.3;
        }
        this.iced = iced;

        for (let i = this.drips.length - 1; i >= 0; i--) {
            const drip = this.drips[i];
            drip.age += dt;
            if (!drip.falling) {
                // Hangs on with the map while it moves
                if (map) {
                    drip.x = map.left + drip.at * span;
                    drip.y = map.bottom + drip.tip;
                }
                if (drip.age >= drip.hang) drip.falling = true;
                continue;
            }
            drip.speed += 1500 * dt;
            drip.y += drip.speed * dt;
            drip.x += frame.wind * 30 * dt;
            if (drip.y > height + 20) drop_at(this.drips, i);
        }
    }

    /** A drop forms under the edge at `at`, or `tip` pixels lower at an icicle's tip */
    private drip(at: number, size: number, red: number, tip = 0) {
        this.drips.push({
            at,
            x: 0,
            y: 0,
            size,
            tip,
            hang: tip ? 0.15 : 0.3 + Math.random() * 0.9,
            age: 0,
            speed: 0,
            falling: false,
            red,
        });
    }

    private make_icicles() {
        const next = seeded(4711);
        for (let i = 0; i < ICICLES; i++) {
            this.icicles.push({
                at: 0.015 + ((i + next() * 0.8) / ICICLES) * 0.97,
                length: 0,
                // Many short ones, a few long
                longest: 5 + next() ** 2.2 * 34,
                width: 2.5 + next() * 3.5,
            });
        }
    }

    /** Whether drops fall and want every frame */
    moving() {
        return this.drips.length > 0;
    }

    /** Whether there is anything to draw, icicles too */
    present() {
        return this.drips.length > 0 || this.iced;
    }

    draw(frame: Frame) {
        const { ctx, map } = frame;
        if (map && this.iced && map.bottom > -60 && map.bottom < frame.height) {
            this.draw_icicles(frame);
        }
        if (!this.drips.length) return;
        for (const [red, colour] of [
            [false, "200, 214, 235, 0.75"],
            [true, "140, 12, 18, 0.85"],
        ] as const) {
            ctx.beginPath();
            for (const drip of this.drips) {
                if (drip.red >= 0.5 !== red) continue;
                if (!drip.falling) {
                    // Swells under the edge until it lets go
                    const grown = Math.min(1, drip.age / drip.hang);
                    const size = drip.size * (0.4 + 0.6 * grown);
                    ctx.moveTo(drip.x + size, drip.y + size);
                    ctx.ellipse(drip.x, drip.y + size, size, size * 1.15, 0, 0, Math.PI * 2);
                } else {
                    const stretch = 1.2 + drip.speed / 700;
                    const size = drip.size * 0.85;
                    ctx.moveTo(drip.x + size, drip.y);
                    ctx.ellipse(drip.x, drip.y, size, size * stretch, 0, 0, Math.PI * 2);
                }
            }
            ctx.fillStyle = `rgba(${colour})`;
            ctx.fill();
        }
    }

    /** Thin pale cones hanging off the edge, with a bright line down one side */
    private draw_icicles(frame: Frame) {
        const { ctx, map } = frame;
        if (!map) return;
        const span = map.right - map.left;
        const ice = ctx.createLinearGradient(0, map.bottom, 0, map.bottom + 40);
        ice.addColorStop(0, "rgba(236, 246, 255, 0.95)");
        ice.addColorStop(1, "rgba(180, 214, 250, 0.5)");
        ctx.beginPath();
        for (const icicle of this.icicles) {
            if (icicle.length < 0.3) continue;
            const x = map.left + icicle.at * span;
            if (x < -10 || x > frame.width + 10) continue;
            const half = icicle.width / 2;
            ctx.moveTo(x - half, map.bottom);
            ctx.quadraticCurveTo(x - half * 0.3, map.bottom + icicle.length * 0.5, x, map.bottom + icicle.length);
            ctx.quadraticCurveTo(x + half * 0.4, map.bottom + icicle.length * 0.45, x + half, map.bottom);
            ctx.closePath();
        }
        ctx.fillStyle = ice;
        ctx.fill();
        ctx.beginPath();
        for (const icicle of this.icicles) {
            if (icicle.length < 3) continue;
            const x = map.left + icicle.at * span;
            ctx.moveTo(x - icicle.width * 0.2, map.bottom + 1);
            ctx.lineTo(x - 0.3, map.bottom + icicle.length * 0.8);
        }
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.stroke();
    }
}
