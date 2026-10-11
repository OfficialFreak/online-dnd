/**
 * Emoji that fly like confetti. canvas-confetti draws emoji as image patterns over a larger
 * area, which Safari fills white around them, so these are drawn as text instead. They move
 * like canvas-confetti's, in steps of a 60 Hz frame, also on screens that draw at 120 Hz.
 */

export type Burst = {
    emojis: string[];
    count: number;
    /** Where they start, as fractions of the canvas, y can lie below it */
    origin: { x: number; y: number };
    /** Degrees, 90 is straight up */
    angle?: number;
    spread?: number;
    /** Height of an emoji in pixels */
    size: number;
    start_velocity?: number;
    /** How long they live, in 60 Hz frames */
    ticks?: number;
};

type Particle = {
    emoji: string;
    size: number;
    /** Set on the first frame, the canvas may have no size yet when they are fired */
    x: number | null;
    y: number;
    origin: { x: number; y: number };
    angle: number;
    velocity: number;
    wobble: number;
    wobble_speed: number;
    tick: number;
    ticks: number;
};

const FRAME = 1000 / 60;
const DECAY = 0.9;
const GRAVITY = 3;

/** Returns a function that fires bursts of emoji on this canvas */
export function emoji_cannon(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    let particles: Particle[] = [];
    let running = false;
    let last = 0;
    let behind = 0;

    function fit() {
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const width = Math.round(rect.width * ratio);
        const height = Math.round(rect.height * ratio);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        return { width: rect.width, height: rect.height, ratio };
    }

    function step(width: number, height: number) {
        for (const particle of particles) {
            if (particle.x === null) {
                particle.x = particle.origin.x * width;
                particle.y = particle.origin.y * height;
            }
            particle.x += Math.cos(particle.angle) * particle.velocity;
            particle.y += Math.sin(particle.angle) * particle.velocity + GRAVITY;
            particle.velocity *= DECAY;
            particle.wobble += particle.wobble_speed;
            particle.tick++;
        }
        particles = particles.filter((particle) => particle.tick < particle.ticks);
    }

    function frame(now: number) {
        if (!context) return;
        const { width, height, ratio } = fit();
        behind += Math.min(now - last, 250);
        last = now;
        while (behind >= FRAME && particles.length > 0) {
            step(width, height);
            behind -= FRAME;
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.textAlign = "center";
        context.textBaseline = "middle";
        for (const particle of particles) {
            if (particle.x === null) continue;
            context.save();
            context.globalAlpha = 1 - particle.tick / particle.ticks;
            context.translate(particle.x, particle.y);
            context.rotate(Math.sin(particle.wobble) * 0.4);
            // Turning in the air, like a flat confetti piece
            context.scale(Math.max(0.3, Math.abs(Math.cos(particle.wobble))), 1);
            context.font = `${particle.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
            context.fillText(particle.emoji, 0, 0);
            context.restore();
        }
        if (particles.length > 0) {
            requestAnimationFrame(frame);
        } else {
            running = false;
            context.clearRect(0, 0, width, height);
        }
    }

    return function fire(burst: Burst) {
        const angle = ((burst.angle ?? 90) * Math.PI) / 180;
        const spread = ((burst.spread ?? 45) * Math.PI) / 180;
        const velocity = burst.start_velocity ?? 45;
        for (let i = 0; i < burst.count; i++) {
            particles.push({
                emoji: burst.emojis[Math.floor(Math.random() * burst.emojis.length)],
                size: burst.size,
                x: null,
                y: 0,
                origin: burst.origin,
                angle: -angle + (0.5 * spread - Math.random() * spread),
                velocity: velocity * 0.5 + Math.random() * velocity,
                wobble: Math.random() * 10,
                wobble_speed: Math.min(0.11, Math.random() * 0.1 + 0.05),
                tick: 0,
                ticks: burst.ticks ?? 200,
            });
        }
        if (!running) {
            running = true;
            last = performance.now();
            behind = FRAME;
            requestAnimationFrame(frame);
        }
    };
}
