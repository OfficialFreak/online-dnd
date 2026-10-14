/**
 * The portal's own sounds, made on the spot with Web Audio: entering it with the tap at the
 * gate, and being cut off as it is woven anew for an update. A worn tape of a deep chord,
 * cracking ice and crackle around the portal's boom, after which the starry void rings on.
 * Stars glint at the gate while it waits for the tap. A scene change plays a quieter mix of
 * both as the smoke closes and draws back.
 *
 * Bred in a page of ideas, from "genes" the user picked: the enter is "Band·1·1·3·2·2",
 * the leave "Eisband", both tuned to D and brought a little closer to each other.
 */
import { audioState, effect_volume } from "./audio.svelte";
import { audio } from "./sfx";

/** The smoke closing in, in seconds, as SceneIntro.svelte does it */
const CLOSE = 1.1;
/** The smoke drawing back after the tap */
const OPEN = 1.7;
/** After an update the app loads anew this long after the smoke began to close */
const RELOAD = 3.5;

type Genes = {
    /** Cracking ice, how loud, 0 leaves it out */
    ice: number;
    /** Where a crack's chirp starts and ends, in hertz, and how long it is */
    ice_high: number;
    ice_low: number;
    ice_length: number;
    ice_count: number;
    /** Crackle, how loud, how many grains, and how late they come as the portal closes */
    crackle: number;
    crackle_count: number;
    crackle_late: number;
    /** The tape, how loud */
    tape: number;
    /** Its chord's root in hertz, and which of CHORDS */
    root: number;
    chord: number;
    /** How much it wavers slowly and quickly, in cents */
    wow: number;
    flutter: number;
    /** How gritty, and how bright at most */
    grit: number;
    bright: number;
    /** How quickly it comes up to speed, and how it bends as it stops */
    spin: number;
    stop: number;
    /** How far the void rings */
    space: number;
};

const ENTER: Genes = {
    ice: 0.3,
    ice_high: 2000,
    ice_low: 130,
    ice_length: 0.13,
    ice_count: 9,
    crackle: 0.53,
    crackle_count: 38,
    crackle_late: 0.72,
    tape: 1.4,
    root: 36.71,
    chord: 3,
    wow: 11,
    flutter: 2,
    grit: 3.2,
    bright: 800,
    spin: 0.19,
    stop: 1.87,
    space: 0.9,
};

const LEAVE: Genes = {
    ice: 0.8,
    ice_high: 2000,
    ice_low: 130,
    ice_length: 0.13,
    ice_count: 9,
    crackle: 0.5,
    crackle_count: 36,
    crackle_late: 0.6,
    tape: 0.9,
    root: 36.71,
    chord: 0,
    wow: 10,
    flutter: 2.5,
    grit: 3.3,
    bright: 770,
    spin: 0.2,
    stop: 1,
    space: 1,
};

/** The chords on the tape, as ratios to its root with their loudness */
const CHORDS = [
    // Minor: root, fifth, octave, minor tenth
    [[1, 1], [1.498, 0.6], [2, 0.45], [2.378, 0.28]],
    // Open fifths, hollow
    [[1, 1], [1.498, 0.7], [2, 0.5], [2.997, 0.3]],
    // Fifth and ninth, unresolved
    [[1, 1], [1.498, 0.6], [2, 0.45], [2.245, 0.3]],
    // Minor, close and dark
    [[1, 1], [1.189, 0.5], [1.498, 0.5], [2, 0.4]],
];

/** The boom against the rest, which plays at full */
const BOOM = 0.55;
/** The stars, faint */
const STARS = 0.1;
/**
 * About as loud as the user wanted at half the effect volume, heard over music. The boom
 * reaches well above full scale before the soft limit.
 */
const LEVEL = 1.66;
/**
 * Rounds off the boom's peak, quieter sounds pass about as they are: in at `INTO`, then a
 * curve that bends with `LIMIT`, so even twice full scale stays inside it
 */
const INTO = 0.38;
const LIMIT = 2.9;

/**
 * As loud as the effects, also while everything else is held: the portal holds the other
 * sounds as it opens and closes
 */
function volume() {
    return audioState.muted ? 0 : audioState.effect_volume;
}

type Kit = {
    white: AudioBuffer;
    brown: AudioBuffer;
    room: AudioBuffer;
    space: AudioBuffer;
    curves: Map<number, Float32Array>;
};

let kit: Kit | null = null;

/** Dense noise dying away, darker as it goes: a hall, or the void */
function echo(ctx: BaseAudioContext, seconds: number, decay: number, onset: number) {
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(2, Math.round(rate * seconds), rate);
    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let low = 0;
        for (let i = 0; i < data.length; i++) {
            const t = i / rate;
            const dark = Math.min(0.94, 0.3 + t * 0.3);
            low = low * dark + (Math.random() * 2 - 1) * (1 - dark);
            data[i] = low * Math.exp(-t / decay) * (t < onset ? t / onset : 1);
        }
    }
    return buffer;
}

/** Noise and echoes, made once: by the stars at the gate, before the tap needs them */
function get_kit(ctx: BaseAudioContext) {
    if (kit && kit.white.sampleRate === ctx.sampleRate) return kit;
    const rate = ctx.sampleRate;
    const white = ctx.createBuffer(2, rate * 4, rate);
    const brown = ctx.createBuffer(2, rate * 4, rate);
    for (let channel = 0; channel < 2; channel++) {
        const w = white.getChannelData(channel);
        const b = brown.getChannelData(channel);
        let last = 0;
        let peak = 0;
        for (let i = 0; i < w.length; i++) {
            w[i] = Math.random() * 2 - 1;
            last = (last + 0.02 * w[i]) / 1.02;
            b[i] = last;
            peak = Math.max(peak, Math.abs(last));
        }
        for (let i = 0; i < b.length; i++) b[i] /= peak;
    }
    kit = {
        white,
        brown,
        room: echo(ctx, 2.4, 0.5, 0.008),
        // Endless and far: long, dark, and it swells in softly
        space: echo(ctx, 6, 1.2, 0.06),
        curves: new Map(),
    };
    return kit;
}

/** A soft saturation, louder parts bend more */
function curve(drive: number) {
    const { curves } = kit!;
    let made = curves.get(drive);
    if (!made) {
        made = new Float32Array(2048);
        for (let i = 0; i < made.length; i++) {
            const x = (i / (made.length - 1)) * 2 - 1;
            made[i] = Math.tanh(drive * x) / Math.tanh(drive);
        }
        curves.set(drive, made);
    }
    return made;
}

/** Building blocks for one sound, all ending in `out` */
function tools(ctx: BaseAudioContext, out: AudioNode) {
    const k = get_kit(ctx);
    const reverb = (buffer: AudioBuffer, brightness: number, lowest: number) => {
        const input = ctx.createGain();
        const convolver = ctx.createConvolver();
        convolver.buffer = buffer;
        const tone = ctx.createBiquadFilter();
        tone.type = "lowpass";
        tone.frequency.value = brightness;
        const level = ctx.createGain();
        let into: AudioNode = input;
        // Twice, steep: the boom's own deep note rang on as a drone
        for (let i = 0; i < 2; i++) {
            const thin = ctx.createBiquadFilter();
            thin.type = "highpass";
            thin.frequency.value = lowest;
            into = into.connect(thin);
        }
        into.connect(convolver).connect(tone).connect(level).connect(out);
        return { input, level: level.gain };
    };
    const room = reverb(k.room, 2600, 20);
    // Wide, not droning: the deepest bass of the boom stays out of it
    const space = reverb(k.space, 2400, 120);
    const T = {
        ctx,
        out,
        /** How much of the void rings, 1 when out there, low in the world */
        void_level: space.level,
        gain(value = 1) {
            const node = ctx.createGain();
            node.gain.value = value;
            return node;
        },
        osc(type: OscillatorType, frequency: number) {
            const node = ctx.createOscillator();
            node.type = type;
            node.frequency.value = frequency;
            return node;
        },
        filter(type: BiquadFilterType, frequency: number, q = 0.707) {
            const node = ctx.createBiquadFilter();
            node.type = type;
            node.frequency.value = frequency;
            node.Q.value = q;
            return node;
        },
        shaper(drive: number) {
            const node = ctx.createWaveShaper();
            node.curve = curve(drive);
            node.oversample = "4x";
            return node;
        },
        pan(value: number) {
            const node = ctx.createStereoPanner();
            node.pan.value = value;
            return node;
        },
        /** Looping noise from a random spot, white or brown (deep, rumbling) */
        noise(kind: "white" | "brown", at: number, until: number) {
            const node = ctx.createBufferSource();
            node.buffer = kind === "brown" ? k.brown : k.white;
            node.loop = true;
            node.start(at, Math.random() * 3);
            node.stop(until);
            return node;
        },
        /** Part of this into the hall around */
        send(node: AudioNode, amount: number) {
            node.connect(T.gain(amount)).connect(room.input);
        },
        /** Part of this out into the void */
        to_void(node: AudioNode, amount: number) {
            node.connect(T.gain(amount)).connect(space.input);
        },
    };
    return T;
}

type Tools = ReturnType<typeof tools>;

/**
 * A deep hit: a sine falling in pitch, saturated so small speakers hear its overtones where
 * they can't play the fundamental
 */
function boom(
    T: Tools,
    at: number,
    o: { from: number; to: number; glide: number; amp: number; decay: number; drive: number; lp: number },
) {
    const tone = T.osc("sine", o.from);
    tone.frequency.setValueAtTime(o.from, at);
    tone.frequency.exponentialRampToValueAtTime(o.to, at + o.glide);
    const env = T.gain(0);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(o.amp, at + 0.005);
    env.gain.setTargetAtTime(0, at + 0.04, o.decay);
    const low = T.filter("lowpass", o.lp);
    tone.connect(env).connect(T.shaper(o.drive)).connect(low).connect(T.out);
    tone.start(at);
    tone.stop(at + o.glide + o.decay * 9);
    return low;
}

/** The body of a hit, a short burst of dull noise, or a bright one with `hp` */
function thump(T: Tools, at: number, o: { lp?: number; hp?: number; amp: number; decay: number }) {
    const burst = T.noise("white", at, at + o.decay * 10);
    const filter = o.hp ? T.filter("highpass", o.hp) : T.filter("lowpass", o.lp ?? 300);
    const env = T.gain(0);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(o.amp, at + 0.002);
    env.gain.setTargetAtTime(0, at + 0.004, o.decay);
    burst.connect(filter).connect(env).connect(T.out);
    return env;
}

/**
 * The portal's own boom, on the tap and as the scroll opens: a great mass falling, its body,
 * and the ground settling. Much of it rings on in the void.
 */
function portal_boom(T: Tools, at: number) {
    const body = boom(T, at, { from: 130, to: 33, glide: 0.18, amp: BOOM, decay: 0.5, drive: 2.8, lp: 260 });
    T.to_void(body, 0.5);
    const knock = thump(T, at, { lp: 240, amp: 0.4 * BOOM, decay: 0.045 });
    T.to_void(knock, 0.3);
    const settle = T.gain(0);
    settle.gain.setValueAtTime(0, at);
    settle.gain.linearRampToValueAtTime(0.35 * BOOM, at + 0.04);
    settle.gain.setTargetAtTime(0, at + 0.08, 0.8);
    T.noise("brown", at, at + 3.5).connect(T.filter("lowpass", 65)).connect(settle).connect(T.out);
}

/** D minor pentatonic, two octaves up from D5, the lower ones more often */
const NOTES = [587.3, 698.5, 784.0, 880.0, 1046.5, 1174.7, 1396.9, 1568.0];

/**
 * Stars glinting now and then, soft and far, mostly heard in the void's echo. About `rate`
 * a second, as loud as `level` says from start (0) to end (1).
 */
function starlight(T: Tools, from: number, until: number, rate: number, level: (x: number) => number) {
    const bus = T.gain(STARS);
    bus.connect(T.gain(0.3)).connect(T.out);
    T.to_void(bus, 1);
    let at = from - Math.log(1 - Math.random()) / rate;
    while (at < until) {
        const loud = level((at - from) / (until - from)) * (0.35 + 0.65 * Math.random());
        if (loud > 0.002) {
            const frequency = NOTES[Math.floor(Math.random() ** 1.4 * NOTES.length)];
            const ring = 0.12 + Math.random() * 0.25;
            const place = T.pan((Math.random() * 2 - 1) * 0.85);
            place.connect(bus);
            for (const [ratio, part, length] of [
                [1, 1, ring],
                [2.01, 0.12, ring * 0.4],
            ]) {
                const tone = T.osc("sine", frequency * ratio);
                const env = T.gain(0);
                env.gain.setValueAtTime(0, at);
                env.gain.linearRampToValueAtTime(loud * part, at + 0.008);
                env.gain.setTargetAtTime(0, at + 0.01, length);
                tone.connect(env).connect(place);
                tone.start(at);
                tone.stop(at + 0.01 + length * 8);
            }
        }
        at += -Math.log(1 - Math.random()) / rate;
    }
}

/** A crack running through ice: a quick falling or rising chirp */
function chirp(
    T: Tools,
    at: number,
    o: { from: number; to: number; length: number; amp: number; pan: number; void: number },
) {
    const tone = T.osc("triangle", o.from);
    tone.frequency.setValueAtTime(o.from, at);
    tone.frequency.exponentialRampToValueAtTime(o.to, at + o.length);
    const env = T.gain(0);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(o.amp, at + 0.003);
    env.gain.setTargetAtTime(0, at + 0.004, o.length * 0.45);
    const place = T.pan(o.pan);
    tone.connect(env).connect(T.filter("lowpass", 2200)).connect(place).connect(T.out);
    T.to_void(place, o.void);
    tone.start(at);
    tone.stop(at + o.length * 4);
}

/** Tiny bursts of torn, crackling noise, kept dull */
function crackle(
    T: Tools,
    t: number,
    count: number,
    when: (x: number) => number,
    o: { loud: (x: number) => number; spread: (x: number) => number },
) {
    const bus = T.gain(1);
    bus.connect(T.shaper(3)).connect(T.filter("lowpass", 3000)).connect(T.out);
    T.send(bus, 0.3);
    for (let i = 0; i < count; i++) {
        const x = i / count;
        const at = t + when(x);
        const length = 0.004 + Math.random() * 0.009;
        const env = T.gain(0);
        env.gain.setValueAtTime(0, at);
        env.gain.linearRampToValueAtTime(o.loud(x) * (0.4 + Math.random() * 0.6), at + 0.001);
        env.gain.linearRampToValueAtTime(0, at + length);
        T.noise("white", at, at + length + 0.01)
            .connect(T.filter("bandpass", 400 + Math.random() * 2000, 3))
            .connect(env)
            .connect(T.pan((Math.random() * 2 - 1) * o.spread(x)))
            .connect(bus);
    }
}

/**
 * A worn tape of a deep chord, wavering and gritty. `pitch` moves all of it in cents, as
 * the tape's speed would.
 */
function tape(T: Tools, t: number, until: number, g: Genes) {
    const speed = T.ctx.createConstantSource();
    const wow = T.osc("sine", 0.6);
    const wow_depth = T.gain(g.wow);
    const flutter = T.osc("sine", 6.5);
    const flutter_depth = T.gain(g.flutter);
    wow.connect(wow_depth);
    flutter.connect(flutter_depth);
    const filter = T.filter("lowpass", 700, 2.2);
    const env = T.gain(0);
    filter.connect(T.shaper(g.grit)).connect(T.filter("lowpass", 1600)).connect(env).connect(T.out);
    T.send(env, 0.2);
    const sources: AudioScheduledSourceNode[] = [speed, wow, flutter];
    for (const [ratio, loud] of CHORDS[g.chord]) {
        for (const cents of [-9, 9]) {
            const saw = T.osc("sawtooth", g.root * ratio);
            saw.detune.value = cents;
            for (const mover of [speed, wow_depth, flutter_depth]) mover.connect(saw.detune);
            saw.connect(T.gain(loud * 0.09)).connect(T.pan(cents > 0 ? 0.35 : -0.35)).connect(filter);
            sources.push(saw);
        }
    }
    const sub = T.osc("sine", g.root);
    speed.connect(sub.detune);
    sub.connect(T.gain(0.35)).connect(filter);
    sources.push(sub);
    for (const source of sources) {
        source.start(t);
        source.stop(until);
    }
    return { pitch: speed.offset, cutoff: filter.frequency, level: env.gain };
}

/** Reality cracks open from the middle, outwards with the smoke drawing back */
function cracks_open(T: Tools, t: number, g: Genes, ice = g.ice) {
    const count = Math.round(g.ice_count);
    for (let i = 0; i < count; i++) {
        const x = count > 1 ? i / (count - 1) : 0;
        chirp(T, t + 0.08 + 1.45 * x ** 1.25 + Math.random() * 0.05, {
            from: g.ice_high * (1 - 0.45 * x + Math.random() * 0.15),
            to: g.ice_low * (0.85 + Math.random() * 0.45),
            length: g.ice_length * (0.7 + Math.random() * 0.6),
            amp: ice * (0.11 - 0.05 * x),
            pan: (i % 2 ? 1 : -1) * (0.1 + 0.8 * x),
            void: (0.35 - 0.25 * x) * g.space,
        });
    }
    crackle(T, t + 0.05, Math.round(g.crackle_count), (x) => 1.6 * x ** 1.3, {
        loud: (x) => g.crackle * 0.12 * (1 - x),
        spread: (x) => 0.2 + 0.8 * x,
    });
}

/** The cracks run back into the middle and heal shut as the smoke closes */
function cracks_close(T: Tools, t: number, g: Genes) {
    const count = Math.round(g.ice_count) + 2;
    for (let i = 0; i < count; i++) {
        const x = i / (count - 1);
        chirp(T, t + CLOSE * 0.97 * x ** 0.6, {
            from: g.ice_low * (0.92 + Math.random() * 0.3),
            to: g.ice_high * (0.65 + Math.random() * 0.25),
            length: g.ice_length * (0.6 + Math.random() * 0.4),
            amp: g.ice * (0.05 + 0.06 * x),
            pan: (i % 2 ? 1 : -1) * (0.95 - 0.9 * x),
            void: 0.15 * g.space,
        });
    }
    crackle(T, t, Math.round(g.crackle_count * 1.1), (x) => CLOSE * 0.98 * x ** g.crackle_late, {
        loud: (x) => g.crackle * (0.04 + 0.1 * x),
        spread: (x) => 1 - x,
    });
}

/**
 * The tape catches at a quarter of its speed and comes up to speed, then gives way after
 * `hold` seconds
 */
function tape_up(T: Tools, t: number, g: Genes, hold: number) {
    const { pitch, cutoff, level } = tape(T, t, t + hold + 2, g);
    pitch.setValueAtTime(-2400, t);
    pitch.setTargetAtTime(0, t + 0.02, g.spin);
    cutoff.setValueAtTime(110, t);
    cutoff.exponentialRampToValueAtTime(g.bright, t + 0.9);
    cutoff.setTargetAtTime(g.bright * 0.47, t + hold + 0.1, 0.5);
    level.setValueAtTime(0, t);
    level.linearRampToValueAtTime(0.42 * g.tape, t + 0.06);
    level.setValueAtTime(0.42 * g.tape, t + hold);
    level.setTargetAtTime(0, t + hold, 0.4);
}

/**
 * The tape running down over CLOSE like a tape that stops, until `lowest` of its speed.
 * `stop` bends how the speed falls.
 */
function tape_down(T: Tools, t: number, g: Genes, lowest: number) {
    const end = t + CLOSE;
    const { pitch, cutoff, level } = tape(T, t, end + 0.1, g);
    const steps = 128;
    const cents = new Float32Array(steps);
    const cutoffs = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
        const speed = 1 - (1 - lowest) * (i / (steps - 1)) ** g.stop;
        cents[i] = 1200 * Math.log2(speed);
        cutoffs[i] = 60 + g.bright * speed ** 1.3;
    }
    pitch.setValueCurveAtTime(cents, t, CLOSE);
    cutoff.setValueCurveAtTime(cutoffs, t, CLOSE);
    level.setValueAtTime(0, t);
    level.linearRampToValueAtTime(0.45 * g.tape, t + 0.06);
    level.setValueAtTime(0.45 * g.tape, t + CLOSE * 0.85);
    level.linearRampToValueAtTime(0, end);
}

/** The tap: the boom, the tape catching and coming up to speed as the smoke draws back */
function enter(T: Tools, t: number, g: Genes) {
    portal_boom(T, t);
    // The void rings around the tap and falls silent as the smoke parts
    T.void_level.setValueAtTime(g.space, t);
    T.void_level.setTargetAtTime(0.15 * g.space, t + 0.25, 0.5);
    starlight(T, t, t + 0.9, 7, (x) => 0.045 * (1 - x));
    cracks_open(T, t, g);
    tape_up(T, t, g, 1);
}

/**
 * The smoke closing: cracks running into the middle, the tape running down, and the boom as
 * the scroll unrolls
 */
function leave(T: Tools, t: number, g: Genes) {
    const end = t + CLOSE;
    // The void opens as the smoke closes, stars after the boom
    T.void_level.setValueAtTime(0.35 * g.space, t);
    T.void_level.linearRampToValueAtTime(g.space, end);
    starlight(T, end + 0.2, t + 3.3, 6, (x) => 0.05 * Math.min(1, x * 4) * (1 - x));
    cracks_close(T, t, g);
    tape_down(T, t, g, 0.035);
    // The mechanism catches, the portal falls shut
    thump(T, end, { lp: 300, amp: 0.25 * g.tape, decay: 0.035 });
    portal_boom(T, end);
    const seal = thump(T, end, { hp: 1100, amp: 0.18 * g.ice, decay: 0.012 });
    T.to_void(seal, 0.5);
}

/**
 * A scene change is quieter than entering or leaving, the music has the stage then. Time
 * slows and the cracks run in as the smoke closes over the old scene, the boom falls as the
 * name of the new one unrolls, and time speeds up again as the smoke draws back from it.
 */
const SCENE = 0.5;

function scene_close(T: Tools, t: number) {
    T.void_level.setValueAtTime(0.35 * LEAVE.space, t);
    T.void_level.linearRampToValueAtTime(0.7 * LEAVE.space, t + CLOSE);
    cracks_close(T, t, LEAVE);
    // Slowing to a quarter without stopping, where the tape picks up again as it opens
    tape_down(T, t, LEAVE, 0.25);
}

function scene_scroll(T: Tools, t: number) {
    portal_boom(T, t);
    starlight(T, t + 0.2, t + 2.5, 5, (x) => 0.045 * Math.min(1, x * 4) * (1 - x));
}

function scene_open(T: Tools, t: number) {
    T.void_level.setValueAtTime(0.6 * ENTER.space, t);
    T.void_level.setTargetAtTime(0.15 * ENTER.space, t + 0.25, 0.5);
    // The new scene breaks through clearly
    cracks_open(T, t, ENTER, LEAVE.ice);
    // Up to speed from where the closing left it, and soon out of the way of the new music
    tape_up(T, t, ENTER, 0.6);
}

function play(sound: (T: Tools, t: number) => void, loud: number, reload = false) {
    const ctx = audio();
    if (!ctx || !loud) return;
    const at = ctx.currentTime + 0.02;
    const bus = ctx.createGain();
    bus.gain.value = LEVEL;
    const T = tools(ctx, bus);
    const into = ctx.createGain();
    into.gain.value = INTO;
    const limit = ctx.createWaveShaper();
    limit.curve = curve(LIMIT);
    limit.oversample = "4x";
    const out = ctx.createGain();
    out.gain.value = loud;
    bus.connect(into).connect(limit).connect(out).connect(ctx.destination);
    sound(T, at);
    // Gone before the app loads anew, which would break it off
    if (reload) {
        bus.gain.setValueAtTime(LEVEL, at + RELOAD - 0.45);
        bus.gain.linearRampToValueAtTime(0, at + RELOAD - 0.05);
    }
}

/** Entering the portal with the tap at the gate, the smoke draws back over OPEN */
export function play_portal_enter() {
    play((T, t) => enter(T, t, ENTER), volume());
}

/**
 * The portal closing for an update, the scroll unrolls with the boom after CLOSE. Faded out
 * before the app loads anew, at RELOAD.
 */
export function play_portal_leave() {
    play((T, t) => leave(T, t, LEAVE), volume(), true);
}

/** A scene change: the smoke closes over the old scene, over CLOSE */
export function play_scene_close() {
    play(scene_close, effect_volume() * SCENE);
}

/** A scene change: the name of the new scene unrolls */
export function play_scene_scroll() {
    play(scene_scroll, effect_volume() * SCENE);
}

/** A scene change: the smoke draws back from the new scene */
export function play_scene_open() {
    play(scene_open, effect_volume() * SCENE);
}

/**
 * Stars glinting at the gate while it waits for the tap, until the returned function ends
 * them. Only where the page may play sound before a tap, as in the desktop app.
 */
export function gate_stars() {
    const ctx = audio();
    if (!ctx) return () => {};
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(ctx.destination);
    const T = tools(ctx, bus);
    // Half a second at a time, a little ahead of the clock, as loud as the effects are now
    let until = ctx.currentTime;
    const ahead = () => {
        bus.gain.setTargetAtTime(LEVEL * volume(), ctx.currentTime, 0.4);
        while (until < ctx.currentTime + 1.5) {
            const from = Math.max(until, ctx.currentTime + 0.05);
            until = from + 0.5;
            starlight(T, from, until, 4, () => 0.045);
        }
    };
    ahead();
    const timer = setInterval(ahead, 400);
    return (fade = 0.8) => {
        clearInterval(timer);
        const now = ctx.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0, now + fade);
        setTimeout(() => bus.disconnect(), (fade + 2) * 1000);
    };
}
