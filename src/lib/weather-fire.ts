/**
 * A fire nearby, a village going up in flames: grey ash tumbling down, glowing embers
 * rising from below, and an orange glow flickering behind the map.
 */
import { drop_at, NONE, type Frame } from "$lib/weather-common";

/** A flake of ash, `spin` turns it so it shows flat or edge on */
type Flake = {
    x: number;
    y: number;
    z: number;
    spin: number;
    turn: number;
    phase: number;
    /** Stays on the top edge of the map if it comes down there */
    settles: boolean;
};
type Ember = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; phase: number };

const MAX_ASH = 380;
/** Embers rising each second at full strength on a 1080p screen */
const MAX_EMBERS = 45;

export class Fire {
    private flakes: Flake[] = [];
    private embers: Ember[] = [];
    private due = 0;

    /**
     * `settle` puts a flake of ash on the map's top edge if it came down there between
     * `before` and its `y` now, and says whether it did
     */
    update(frame: Frame, settle: (x: number, before: number, y: number) => boolean) {
        const { dt, width, height, wind, now } = frame;
        const ash = frame.shown.ash;
        const t = now / 1000;

        const flakes = frame.count(MAX_ASH, ash);
        while (this.flakes.length < flakes) {
            this.flakes.push({
                x: Math.random() * width,
                y: -Math.random() * height * 0.6,
                z: 0.3 + Math.random() * 0.7,
                spin: Math.random() * Math.PI * 2,
                turn: (Math.random() - 0.5) * 5,
                phase: Math.random() * Math.PI * 2,
                settles: Math.random() < 0.35,
            });
        }
        for (let i = this.flakes.length - 1; i >= 0; i--) {
            const flake = this.flakes[i];
            const before = flake.y;
            flake.y += (16 + 40 * flake.z) * dt;
            flake.x += (wind * 120 * flake.z + Math.cos(t * 0.8 + flake.phase) * 14) * dt;
            flake.spin += flake.turn * dt;
            if (flake.x < -10) flake.x += width + 20;
            if (flake.x > width + 10) flake.x -= width + 20;
            const landed = flake.settles && settle(flake.x, before, flake.y);
            if (landed || flake.y - 4 > height) {
                if (this.flakes.length > flakes) {
                    drop_at(this.flakes, i);
                    continue;
                }
                flake.y = -Math.random() * 20;
                flake.x = Math.random() * width;
                flake.settles = Math.random() < 0.35;
            }
        }

        // Embers rise from below the screen, wobbling, and go out on the way up
        if (ash >= NONE) {
            this.due += frame.count(MAX_EMBERS, ash) * dt;
        } else {
            this.due = 0;
        }
        while (this.due >= 1) {
            this.due--;
            this.embers.push({
                x: Math.random() * width,
                y: height + 10,
                vx: (Math.random() - 0.5) * 30,
                vy: -(50 + Math.random() * 110),
                age: 0,
                life: 2.5 + Math.random() * 4,
                size: 0.8 + Math.random() * 1.6,
                phase: Math.random() * Math.PI * 2,
            });
        }
        for (let i = this.embers.length - 1; i >= 0; i--) {
            const ember = this.embers[i];
            ember.age += dt;
            ember.x += (ember.vx + wind * 70 + Math.sin(t * 2.2 + ember.phase) * 25) * dt;
            ember.y += ember.vy * dt;
            if (ember.age >= ember.life || ember.y < -20) drop_at(this.embers, i);
        }
    }

    busy() {
        return this.flakes.length > 0 || this.embers.length > 0;
    }

    /** The glow of the fire from below, flickering, behind the map */
    draw_glow(frame: Frame) {
        const ash = frame.shown.ash;
        if (ash < NONE) return;
        const { ctx, width, height } = frame;
        const t = frame.now / 1000;
        const flicker = 0.85 + 0.1 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 7.1 + 1);
        const glow = ctx.createRadialGradient(width / 2, height * 1.15, 0, width / 2, height * 1.15, Math.max(width, height) * 0.95);
        glow.addColorStop(0, `rgba(255, 110, 30, ${0.38 * ash * flicker})`);
        glow.addColorStop(0.55, `rgba(200, 60, 20, ${0.14 * ash * flicker})`);
        glow.addColorStop(1, "rgba(120, 30, 10, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
    }

    draw(frame: Frame) {
        const { ctx } = frame;
        if (this.flakes.length) {
            // Grey flakes, darker ones further off, turning as they fall
            for (const [from, to, colour] of [
                [0.3, 0.55, "95, 92, 90, 0.55"],
                [0.55, 0.8, "120, 116, 112, 0.7"],
                [0.8, 1.01, "150, 146, 140, 0.85"],
            ] as const) {
                ctx.beginPath();
                for (const flake of this.flakes) {
                    if (flake.z < from || flake.z >= to) continue;
                    const size = 1 + 2.6 * flake.z;
                    const flat = Math.max(0.25, Math.abs(Math.cos(flake.spin)));
                    ctx.moveTo(flake.x + size, flake.y);
                    ctx.ellipse(flake.x, flake.y, size, size * flat * 0.7, flake.spin * 0.5, 0, Math.PI * 2);
                }
                ctx.fillStyle = `rgba(${colour})`;
                ctx.fill();
            }
        }
        if (this.embers.length) {
            // A soft halo and a bright core, adding up where they meet
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const t = frame.now / 1000;
            for (const [halo, colour] of [
                [3.2, "255, 110, 30"],
                [1, "255, 205, 120"],
            ] as const) {
                for (const bright of [0.35, 0.7, 1]) {
                    ctx.beginPath();
                    for (const ember of this.embers) {
                        const flicker = 0.55 + 0.45 * Math.sin(t * 14 + ember.phase * 5);
                        const left = 1 - ember.age / ember.life;
                        const strength = flicker * Math.min(1, left * 3);
                        // Each into the brightest group it reaches
                        if (strength > bright || strength <= bright - 0.35) continue;
                        const radius = ember.size * halo;
                        ctx.moveTo(ember.x + radius, ember.y);
                        ctx.arc(ember.x, ember.y, radius, 0, Math.PI * 2);
                    }
                    ctx.fillStyle = `rgba(${colour}, ${(halo > 1 ? 0.16 : 0.9) * bright})`;
                    ctx.fill();
                }
            }
            ctx.restore();
        }
    }
}
