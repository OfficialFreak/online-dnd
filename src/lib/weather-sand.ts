/**
 * A sandstorm: grains racing almost level with the wind, ochre clouds of dust rolling
 * past, and sand piling up against the side of the map the wind blows at.
 */
import { cloud_sprite, drop_at, half_layer, NONE, seeded, type Frame } from "$lib/weather-common";

type Grain = { x: number; y: number; z: number; phase: number };
type Cloud = { x: number; y: number; width: number; speed: number; sprite: number };

const MAX_GRAINS = 900;
const CLOUDS = 6;
/** The sand against a side of the map, how deep it is at this many places down it */
const DRIFT_PLACES = 60;

export class Sand {
    private grains: Grain[] = [];
    private clouds: Cloud[] = [];
    private sprites: HTMLCanvasElement[] = [];
    private layer: HTMLCanvasElement | null = null;
    private layer_drawn = -Infinity;
    /** How deep the sand lies against the left and the right side of the map, in pixels */
    private drifts = [new Float32Array(DRIFT_PLACES), new Float32Array(DRIFT_PLACES)];
    private drifted = false;
    /** Some places pile up higher than others, the same each time */
    private bumps = Array.from({ length: DRIFT_PLACES }, (_, i) => 0.8 + 0.2 * seeded(i * 13 + 5)());

    /** Where it blows to, to the right without wind */
    private direction(wind: number) {
        return wind < -0.02 ? -1 : 1;
    }

    update(frame: Frame) {
        const { dt, width, height, wind } = frame;
        const sand = frame.shown.sand;
        const direction = this.direction(wind);
        const speed = 0.6 + Math.min(1.6, Math.abs(wind));
        const t = frame.now / 1000;

        const grains = frame.count(MAX_GRAINS, sand);
        while (this.grains.length < grains) {
            this.grains.push({
                x: Math.random() * width,
                y: Math.random() * height,
                z: 0.3 + Math.random() * 0.7,
                phase: Math.random() * Math.PI * 2,
            });
        }
        for (let i = this.grains.length - 1; i >= 0; i--) {
            const grain = this.grains[i];
            grain.x += direction * (420 + 650 * grain.z) * speed * dt;
            grain.y += (25 + 50 * grain.z + Math.sin(t * 3 + grain.phase) * 60) * dt;
            const out = direction > 0 ? grain.x > width + 20 : grain.x < -20;
            if (out || grain.y > height + 10) {
                if (this.grains.length > grains) {
                    drop_at(this.grains, i);
                    continue;
                }
                // In again on the side it blows from
                grain.x = direction > 0 ? -10 - Math.random() * 40 : width + 10 + Math.random() * 40;
                grain.y = Math.random() * height;
            }
        }

        if (sand >= NONE && !this.clouds.length) this.make_clouds(width, height);
        for (const cloud of this.clouds) {
            cloud.x += direction * cloud.speed * speed * dt;
            if (cloud.x > width) cloud.x = -cloud.width;
            if (cloud.x < -cloud.width) cloud.x = width;
        }
        if (sand < NONE && !this.grains.length) this.clouds = [];

        // Piles up against the side it blows at over a minute or so, thickest at the
        // bottom like a dune, and blows away from the other side
        const deepest = 6 + 22 * sand;
        let drifted = false;
        for (const side of [0, 1]) {
            const windward = sand >= NONE && (side === 0) === direction > 0;
            const drift = this.drifts[side];
            for (let i = 0; i < DRIFT_PLACES; i++) {
                const shape = deepest * (0.2 + 0.8 * (i / (DRIFT_PLACES - 1)) ** 1.6) * this.bumps[i];
                if (windward && drift[i] < shape) drift[i] = Math.min(shape, drift[i] + (dt * shape) / 45);
                else if (!windward || drift[i] > shape) drift[i] = Math.max(0, drift[i] - dt * 0.6);
                drifted ||= drift[i] > 0.05;
            }
        }
        this.drifted = drifted;
    }

    /** Whether grains fly and want every frame */
    moving() {
        return this.grains.length > 0;
    }

    /** Whether there is anything to draw, sand piled against the map too */
    present() {
        return this.grains.length > 0 || this.drifted;
    }

    /** The dust clouds, behind the grains, softly at half the size */
    draw_clouds(frame: Frame) {
        const sand = frame.shown.sand;
        if (sand < NONE || !this.clouds.length) return;
        if (frame.dt === 0 || frame.now - this.layer_drawn >= 30) {
            this.layer_drawn = frame.now;
            const { layer, ctx } = half_layer(this.layer, frame.width, frame.height);
            this.layer = layer;
            for (const cloud of this.clouds) {
                ctx.globalAlpha = sand * 0.7;
                ctx.drawImage(this.sprites[cloud.sprite], cloud.x, cloud.y, cloud.width, cloud.width * 0.45);
            }
            ctx.globalAlpha = 1;
        }
        frame.ctx.drawImage(this.layer!, 0, 0, frame.width, frame.height);
    }

    /** The sand piled against the sides of the map */
    draw_drifts(frame: Frame) {
        const { ctx, map } = frame;
        if (!map || !this.drifted) return;
        const step = (map.bottom - map.top) / DRIFT_PLACES;
        for (const side of [0, 1]) {
            const drift = this.drifts[side];
            if (!drift.some((depth) => depth > 0.05)) continue;
            const edge = side === 0 ? map.left : map.right;
            const out = side === 0 ? -1 : 1;
            if (edge + out * 30 < -30 || edge + out * 30 > frame.width + 30) continue;
            ctx.beginPath();
            ctx.moveTo(edge, map.top);
            let [x, y] = [edge + out * drift[0], map.top + step * 0.5];
            ctx.lineTo(x, y);
            for (let i = 1; i < DRIFT_PLACES; i++) {
                const nx = edge + out * drift[i];
                const ny = map.top + (i + 0.5) * step;
                ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
                [x, y] = [nx, ny];
            }
            // Slopes down onto the ground below the corner
            ctx.quadraticCurveTo(x, map.bottom, x + out * drift[DRIFT_PLACES - 1] * 0.6, map.bottom);
            ctx.lineTo(edge, map.bottom);
            ctx.closePath();
            const shade = ctx.createLinearGradient(edge, 0, edge + out * 20, 0);
            shade.addColorStop(0, "rgba(196, 156, 98, 0.96)");
            shade.addColorStop(1, "rgba(222, 186, 128, 0.96)");
            ctx.fillStyle = shade;
            ctx.fill();
        }
    }

    draw(frame: Frame) {
        if (!this.grains.length) return;
        const { ctx, wind } = frame;
        const direction = this.direction(wind);
        for (const [from, to, colour, line] of [
            [0.3, 0.55, "190, 150, 95, 0.35", 1],
            [0.55, 0.8, "205, 168, 112, 0.5", 1.2],
            [0.8, 1.01, "225, 190, 135, 0.65", 1.5],
        ] as const) {
            ctx.beginPath();
            for (const grain of this.grains) {
                if (grain.z < from || grain.z >= to) continue;
                const length = 3 + 9 * grain.z;
                ctx.moveTo(grain.x, grain.y);
                ctx.lineTo(grain.x - direction * length, grain.y - length * 0.12);
            }
            ctx.strokeStyle = `rgba(${colour})`;
            ctx.lineWidth = line;
            ctx.stroke();
        }
    }

    private make_clouds(width: number, height: number) {
        if (!this.sprites.length) {
            for (let i = 0; i < 3; i++) this.sprites.push(cloud_sprite("205, 165, 105"));
        }
        for (let i = 0; i < CLOUDS; i++) {
            const cloud_width = width * (0.5 + Math.random() * 0.7);
            this.clouds.push({
                x: Math.random() * (width + cloud_width) - cloud_width,
                y: Math.random() * height - cloud_width * 0.2,
                width: cloud_width,
                speed: 90 + Math.random() * 160,
                sprite: i % 3,
            });
        }
    }
}
