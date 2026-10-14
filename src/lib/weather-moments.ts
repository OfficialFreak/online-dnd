/**
 * What the DM lets happen for a few seconds over everyone's map: blood rain, gold rain and
 * a quake that shakes dust and rubble loose. The thunderclap is a flash of the storm.
 */
import type { WeatherMomentKind } from "$lib/types/messaging/server_messages";
import { drop_at, quake_strength, seeded, type Frame } from "$lib/weather-common";

/** A coin or a pebble, falling, bouncing off the map's top edge and lying there a while */
type Piece = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    spin: number;
    turn: number;
    bounces: number;
    /** Seconds it has lain, once it lies */
    lying: number | null;
    /** How long it lies before it is gone */
    stays: number;
    /** A pebble's corners, for coins none */
    corners: number[] | null;
};
/** Fine dust trickling, or with `cloud` a soft puff billowing out */
type Dust = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    age: number;
    life: number;
    cloud: boolean;
};

/** How long blood rain lasts, in milliseconds */
const BLOOD_FOR = 6500;
const GOLD_FOR = 2400;
/** As long as the rumble, see play_rumble() */
export const QUAKE_FOR = 4400;

export class Moments {
    private blood_since = -Infinity;
    private gold_since = -Infinity;
    private quake_since = -Infinity;
    private quake_streams: number[] = [];
    private coins: Piece[] = [];
    private pebbles: Piece[] = [];
    private dust: Dust[] = [];
    private coins_due = 0;
    private pebbles_due = 0;
    private crumbs_due = 0;
    /** A soft round puff of dust, drawn once, for the clouds */
    private puff_sprite: HTMLCanvasElement | null = null;

    constructor(
        /** A coin hit the map, `loudness` by how hard */
        private on_clink?: (loudness: number) => void,
    ) {}

    start(moment: WeatherMomentKind, seed: number, now: number) {
        if (moment === "blood") this.blood_since = now;
        if (moment === "gold") this.gold_since = now;
        if (moment === "quake") {
            this.quake_since = now;
            // Dust trickles down in a few streams from above
            const next = seeded(seed);
            this.quake_streams = Array.from({ length: 5 + Math.floor(next() * 4) }, () => next());
        }
    }

    /** How much blood rains now, from 0 to 1: it pours in quickly and lets up slowly */
    blood(now: number) {
        const since = now - this.blood_since;
        if (since < 0 || since > BLOOD_FOR) return 0;
        if (since < 600) return since / 600;
        if (since > BLOOD_FOR - 1800) return (BLOOD_FOR - since) / 1800;
        return 1;
    }

    busy(now: number) {
        return (
            this.blood(now) > 0 ||
            now - this.gold_since < GOLD_FOR ||
            now - this.quake_since < QUAKE_FOR ||
            this.coins.length > 0 ||
            this.pebbles.length > 0 ||
            this.dust.length > 0
        );
    }

    /**
     * `surface` is where a piece at `x` would come down on the map's top edge, on the snow
     * lying there, null beside the map
     */
    update(frame: Frame, surface: (x: number) => number | null) {
        const { dt, width, height, now, map } = frame;

        if (now - this.gold_since < GOLD_FOR) {
            this.coins_due += 48 * (frame.lite ? 0.6 : 1) * dt;
            while (this.coins_due >= 1) {
                this.coins_due--;
                this.coins.push(piece(Math.random() * width, -20 - Math.random() * 60, 5 + Math.random() * 4, false));
            }
        }

        const since = now - this.quake_since;
        if (since < QUAKE_FOR) {
            // Harder in the jolts, see quake_strength()
            const shaking = quake_strength(since / QUAKE_FOR);
            // Rubble falls from above onto the map
            this.pebbles_due += 18 * shaking * dt;
            while (this.pebbles_due >= 1) {
                this.pebbles_due--;
                this.pebbles.push(piece(Math.random() * width, -10, 2 + Math.random() ** 1.8 * 7, true));
            }
            // The map's edges crumble, chunks break off with a puff of dust
            if (map) this.crumble(frame, 40 * shaking * dt);
            // Fine dust trickles from above in a few streams, with grit falling faster
            for (const stream of this.quake_streams) {
                const x = stream * width;
                for (let due = 80 * shaking * dt; due > 0; due--) {
                    if (Math.random() >= due) continue;
                    this.dust.push({
                        x: x + (Math.random() - 0.5) * 20,
                        y: -6,
                        vx: (Math.random() - 0.5) * 40,
                        vy: 35 + Math.random() * 70,
                        size: 0.7 + Math.random() * 1.6,
                        age: 0,
                        life: 1.8 + Math.random() * 2,
                        cloud: false,
                    });
                }
                if (Math.random() < 10 * shaking * dt) {
                    const grit = piece(x + (Math.random() - 0.5) * 10, -6, 0.6 + Math.random() * 1.2, true);
                    grit.vy = 160 + Math.random() * 120;
                    this.pebbles.push(grit);
                }
            }
        }

        for (const [pieces, coins] of [
            [this.coins, true],
            [this.pebbles, false],
        ] as const) {
            for (let i = pieces.length - 1; i >= 0; i--) {
                const p = pieces[i];
                p.spin += p.turn * dt;
                if (p.lying !== null) {
                    p.lying += dt;
                    p.x += p.vx * dt;
                    p.vx *= Math.max(0, 1 - dt * 4);
                    const ground = surface(p.x);
                    // Rolled off the edge: falls again
                    if (ground === null) p.lying = null;
                    else p.y = ground - (coins ? p.size * 0.3 : p.size * 0.5);
                    if (p.lying !== null && p.lying > p.stays) drop_at(pieces, i);
                    continue;
                }
                const before = p.y;
                p.vy += (coins ? 1300 : 950) * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                const ground = surface(p.x);
                if (ground !== null && before < ground && p.y >= ground) {
                    p.y = ground;
                    if (p.bounces < 2 && p.vy > 140) {
                        if (coins) this.on_clink?.(Math.min(1, p.vy / 900));
                        else if (p.bounces === 0) this.puff(p.x, ground, p.size);
                        p.vy = -p.vy * (0.3 + Math.random() * 0.2);
                        p.vx += (Math.random() - 0.5) * 110;
                        p.turn *= 1.5;
                        p.bounces++;
                    } else {
                        if (coins && p.bounces === 0) this.on_clink?.(0.5);
                        p.lying = 0;
                        p.vy = 0;
                        p.turn = 0;
                    }
                }
                if (p.y > height + 30) drop_at(pieces, i);
            }
        }

        for (let i = this.dust.length - 1; i >= 0; i--) {
            const d = this.dust[i];
            d.age += dt;
            d.x += (d.vx + frame.wind * 20) * dt;
            d.y += d.vy * dt;
            // Clouds slow down and billow, fine dust keeps falling
            d.vy += (d.cloud ? 6 : 25) * dt;
            d.vx *= Math.max(0, 1 - dt * (d.cloud ? 1.6 : 0.8));
            if (d.cloud) d.vy *= Math.max(0, 1 - dt * 1.2);
            d.size += (d.cloud ? 14 : 2.2) * dt;
            if (d.age > d.life) drop_at(this.dust, i);
        }
    }

    /**
     * Chunks break off the map's bottom and sides, `due` of them this frame, and fall
     * away, each with a puff of dust where it broke
     */
    private crumble(frame: Frame, due: number) {
        const { map, width, height } = frame;
        if (!map) return;
        // The parts of the edges on the screen
        const left = Math.max(0, map.left);
        const right = Math.min(width, map.right);
        const top = Math.max(0, map.top);
        const bottom = Math.min(height, map.bottom);
        const edges: [number, () => [number, number, number]][] = [];
        if (map.bottom < height && right > left) {
            edges.push([right - left, () => [left + Math.random() * (right - left), map.bottom, 0]]);
        }
        if (map.left > 0 && bottom > top) {
            edges.push([(bottom - top) * 0.6, () => [map.left, top + Math.random() * (bottom - top), -1]]);
        }
        if (map.right < width && bottom > top) {
            edges.push([(bottom - top) * 0.6, () => [map.right, top + Math.random() * (bottom - top), 1]]);
        }
        const total = edges.reduce((sum, [length]) => sum + length, 0);
        if (!total) return;
        this.crumbs_due += due;
        while (this.crumbs_due >= 1) {
            this.crumbs_due--;
            let pick = Math.random() * total;
            const [, place] = edges.find(([length]) => (pick -= length) < 0) ?? edges[0];
            const [x, y, side] = place();
            const chunk = piece(x + side * 2, y + (side ? 0 : 2), 2 + Math.random() ** 1.6 * 7, true);
            chunk.vx = side * (20 + Math.random() * 60) + (Math.random() - 0.5) * 30;
            chunk.vy = side ? -20 + Math.random() * 40 : 10 + Math.random() * 50;
            this.pebbles.push(chunk);
            this.puff(x, y, chunk.size, side);
        }
    }

    /** A cloud of dust where rubble hit or broke off, puffing out to `side` */
    private puff(x: number, y: number, size: number, side = 0) {
        const clouds = 2 + Math.floor(size / 2);
        for (let i = 0; i < clouds; i++) {
            this.dust.push({
                x: x + (Math.random() - 0.5) * size * 1.5,
                y: y - 2 + (Math.random() - 0.5) * size,
                vx: side * (25 + Math.random() * 45) + (Math.random() - 0.5) * 60,
                vy: -6 - Math.random() * 22,
                size: 6 + Math.random() * 6 + size * 1.5,
                age: 0,
                life: 1.5 + Math.random() * 1.4,
                cloud: true,
            });
        }
    }

    draw(frame: Frame) {
        const { ctx } = frame;
        if (this.dust.length) this.draw_dust(frame);
        if (this.pebbles.length) {
            // Each chunk dark, with a lighter face towards the sky, so it looks solid
            for (const [face, colour] of [
                [false, "68, 61, 55, 0.96"],
                [true, "132, 121, 107, 0.92"],
            ] as const) {
                ctx.beginPath();
                for (const p of this.pebbles) {
                    if (face && p.size < 1.6) continue;
                    const corners = p.corners!;
                    const scale = face ? 0.55 : 1;
                    const cx = p.x - (face ? p.size * 0.22 : 0);
                    const cy = p.y - (face ? p.size * 0.26 : 0);
                    for (let i = 0; i < corners.length; i++) {
                        const angle = p.spin + (i / corners.length) * Math.PI * 2;
                        const x = cx + Math.cos(angle) * p.size * corners[i] * scale;
                        const y = cy + Math.sin(angle) * p.size * corners[i] * scale;
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                }
                ctx.fillStyle = `rgba(${colour})`;
                ctx.fill();
            }
        }
        if (this.coins.length) this.draw_coins(frame);
    }

    /** Fine dust as dots, the clouds as soft puffs fading as they spread */
    private draw_dust(frame: Frame) {
        const { ctx } = frame;
        for (const [from, alpha] of [
            [0, 0.24],
            [0.5, 0.11],
        ] as const) {
            ctx.beginPath();
            for (const d of this.dust) {
                const age = d.age / d.life;
                if (d.cloud || age < from || age >= from + 0.5) continue;
                ctx.moveTo(d.x + d.size, d.y);
                ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
            }
            ctx.fillStyle = `rgba(160, 145, 125, ${alpha})`;
            ctx.fill();
        }
        const sprite = (this.puff_sprite ??= puff_sprite());
        for (const d of this.dust) {
            if (!d.cloud) continue;
            const age = d.age / d.life;
            ctx.globalAlpha = 0.6 * Math.min(1, age * 6) * (1 - age) ** 1.3;
            ctx.drawImage(sprite, d.x - d.size, d.y - d.size, d.size * 2, d.size * 2);
        }
        ctx.globalAlpha = 1;
    }

    /**
     * Gold coins turning as they fall, flat once they lie on the edge, a light rim on the
     * side towards the sky
     */
    private draw_coins(frame: Frame) {
        const { ctx } = frame;
        for (const [rim, colour] of [
            [false, "184, 134, 24"],
            [true, "255, 221, 110"],
        ] as const) {
            ctx.beginPath();
            for (const p of this.coins) {
                const fade = p.lying !== null ? Math.min(1, (p.stays - p.lying) * 2) : 1;
                if (fade <= 0.05) continue;
                const wide = p.lying !== null ? p.size : p.size * Math.max(0.12, Math.abs(Math.cos(p.spin)));
                const high = p.lying !== null ? p.size * 0.32 : p.size;
                const shrink = rim ? 0.72 : 1;
                const lift = rim ? -high * 0.12 : 0;
                ctx.moveTo(p.x + wide * shrink, p.y + lift);
                ctx.ellipse(p.x, p.y + lift, wide * shrink * fade, high * shrink * fade, 0, 0, Math.PI * 2);
            }
            ctx.fillStyle = `rgb(${colour})`;
            ctx.fill();
        }
    }
}

/** A soft round puff, densest in the middle, in the colour of dry dust */
function puff_sprite() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const puff = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    puff.addColorStop(0, "rgba(168, 154, 134, 0.9)");
    puff.addColorStop(0.5, "rgba(160, 146, 126, 0.45)");
    puff.addColorStop(1, "rgba(150, 138, 120, 0)");
    ctx.fillStyle = puff;
    ctx.fillRect(0, 0, 64, 64);
    return canvas;
}

function piece(x: number, y: number, size: number, pebble: boolean): Piece {
    return {
        x,
        y,
        vx: (Math.random() - 0.5) * 40,
        vy: 120 + Math.random() * 160,
        size,
        spin: Math.random() * Math.PI * 2,
        turn: (pebble ? 4 : 9) + Math.random() * 10,
        bounces: 0,
        lying: null,
        stays: pebble ? 1.2 + Math.random() * 1.5 : 1.6 + Math.random() * 1.6,
        corners: pebble ? Array.from({ length: 5 + Math.floor(Math.random() * 2) }, () => 0.65 + Math.random() * 0.45) : null,
    };
}
