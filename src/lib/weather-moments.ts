/**
 * What the DM lets happen for a few seconds over everyone's map: blood rain, gold rain and
 * a quake that shakes dust and pebbles loose. The thunderclap is a flash of the storm.
 */
import type { WeatherMomentKind } from "$lib/types/messaging/server_messages";
import { drop_at, seeded, type Frame } from "$lib/weather-common";

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
type Dust = { x: number; y: number; vx: number; vy: number; size: number; age: number; life: number };

/** How long blood rain lasts, in milliseconds */
const BLOOD_FOR = 6500;
const GOLD_FOR = 2400;
const QUAKE_FOR = 2600;

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

        const quaking = now - this.quake_since < QUAKE_FOR;
        if (quaking) {
            const shaking = 1 - (now - this.quake_since) / QUAKE_FOR;
            // Pebbles fall from above and crumble off the bottom edge of the map
            this.pebbles_due += 22 * shaking * dt;
            while (this.pebbles_due >= 1) {
                this.pebbles_due--;
                const from_map = map && map.bottom < height && Math.random() < 0.45;
                const x = from_map
                    ? Math.max(map.left, 0) + Math.random() * (Math.min(map.right, width) - Math.max(map.left, 0))
                    : Math.random() * width;
                const pebble = piece(x, from_map ? map.bottom : -10, 1.6 + Math.random() * 3, true);
                if (from_map) pebble.vy = 20 + Math.random() * 60;
                this.pebbles.push(pebble);
            }
            // Fine dust trickles from above in a few streams, with grit falling faster
            for (const stream of this.quake_streams) {
                const x = stream * width;
                let due = 70 * shaking * dt;
                while (due > 0) {
                    if (Math.random() < due) {
                        this.dust.push({
                            x: x + (Math.random() - 0.5) * 20,
                            y: -6,
                            vx: (Math.random() - 0.5) * 40,
                            vy: 35 + Math.random() * 70,
                            size: 0.8 + Math.random() * 1.8,
                            age: 0,
                            life: 1.6 + Math.random() * 1.8,
                        });
                    }
                    due--;
                }
                if (Math.random() < 9 * shaking * dt) {
                    const grit = piece(x + (Math.random() - 0.5) * 10, -6, 0.7 + Math.random() * 0.9, true);
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
                p.vy += 1300 * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                const ground = surface(p.x);
                if (ground !== null && before < ground && p.y >= ground) {
                    p.y = ground;
                    if (p.bounces < 2 && p.vy > 140) {
                        if (coins) this.on_clink?.(Math.min(1, p.vy / 900));
                        else if (p.bounces === 0) this.puff(p.x, ground);
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
            d.vy += 25 * dt;
            d.vx *= Math.max(0, 1 - dt * 0.8);
            d.size += 2.2 * dt;
            if (d.age > d.life) drop_at(this.dust, i);
        }
    }

    /** A little cloud of dust where a pebble hit */
    private puff(x: number, y: number) {
        for (let i = 0; i < 4; i++) {
            this.dust.push({
                x,
                y: y - 2,
                vx: (Math.random() - 0.5) * 60,
                vy: -10 - Math.random() * 25,
                size: 2 + Math.random() * 3,
                age: 0,
                life: 0.8 + Math.random() * 0.7,
            });
        }
    }

    draw(frame: Frame) {
        const { ctx } = frame;
        if (this.dust.length) {
            for (const [from, alpha] of [
                [0, 0.24],
                [0.5, 0.11],
            ] as const) {
                ctx.beginPath();
                for (const d of this.dust) {
                    const age = d.age / d.life;
                    if (age < from || age >= from + 0.5) continue;
                    ctx.moveTo(d.x + d.size, d.y);
                    ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                }
                ctx.fillStyle = `rgba(160, 145, 125, ${alpha})`;
                ctx.fill();
            }
        }
        if (this.pebbles.length) {
            ctx.beginPath();
            for (const p of this.pebbles) {
                const corners = p.corners!;
                const fade = p.lying !== null ? 1 - p.lying / p.stays : 1;
                if (fade <= 0) continue;
                for (let i = 0; i < corners.length; i++) {
                    const angle = p.spin + (i / corners.length) * Math.PI * 2;
                    const x = p.x + Math.cos(angle) * p.size * corners[i];
                    const y = p.y + Math.sin(angle) * p.size * corners[i];
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
            }
            ctx.fillStyle = "rgba(92, 84, 76, 0.95)";
            ctx.fill();
        }
        if (this.coins.length) this.draw_coins(frame);
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
