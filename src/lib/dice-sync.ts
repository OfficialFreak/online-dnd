// Shows everyone the same roll: the client that rolls records how its dice move, the
// others play that back instead of throwing their own dice. dice-box has no way to do
// this, so its physics worker gets a few lines added while dice-box loads it. Written
// for @3d-dice/dice-box 1.1.4, if its code changes the dice just aren't shared anymore.
//
// Import this before dice-box: the physics worker is created when dice-box is loaded.

/** How the dice of a roll moved, in the coordinates of the dice box */
export type DiceReplay = {
    /** What was thrown, e.g. ["2d20", "1d6"], and in which look */
    notation: string[];
    theme?: string;
    themeColor?: string;
    /** The ids the roller's dice had, in the order they were added */
    ids: number[];
    /** Milliseconds since the first frame */
    times: number[];
    /** dice-box's physics frames: their count, then id, x, y, z and a quaternion for each */
    frames: number[][];
};

// One per window: other windows have their own dice
const CHANNEL = `dice-sync-${Math.random().toString(36).slice(2)}`;

/** Runs inside the physics worker, `k` is its buffer of dice positions */
const WORKER_CODE = `
const __diceSync = new BroadcastChannel("${CHANNEL}");
let __diceIds = [], __diceRecording = null, __diceReplay = null;
__diceSync.onmessage = (event) => {
    const message = event.data;
    if (message.action === "record") {
        __diceIds = [];
        __diceReplay = null;
        __diceRecording = { elapsed: 0, times: [], frames: [] };
        __diceSync.postMessage({ action: "recording" });
    } else if (message.action === "finish") {
        const recording = __diceRecording;
        __diceRecording = null;
        __diceSync.postMessage({
            action: "recorded",
            ids: __diceIds,
            times: recording ? recording.times : [],
            frames: recording ? recording.frames : [],
        });
    } else if (message.action === "stop") {
        __diceReplay = null;
        __diceRecording = null;
    } else if (message.action === "replay") {
        __diceIds = [];
        __diceRecording = null;
        __diceReplay = { ids: message.ids, times: message.times, frames: message.frames, cursor: 0, elapsed: 0, moved: new Map(), asleep: [] };
        __diceSync.postMessage({ action: "replaying" });
    }
};
const __diceAdded = (id) => {
    __diceIds.push(id);
    return __diceReplay !== null;
};
const __diceRecord = (time) => {
    const recording = __diceRecording;
    const count = k[0];
    if (!recording || (!(count > 0) && recording.frames.length === 0)) return;
    recording.elapsed += time;
    recording.times.push(recording.elapsed);
    recording.frames.push(Array.from(k.subarray(0, 1 + count * 8)));
};
const __diceReplayStep = (time) => {
    const replay = __diceReplay;
    // Both clients added their dice in the same order
    const local = (id) => __diceIds[replay.ids.indexOf(id)];
    k[0] = 0;
    if (__diceIds.length === 0) return;
    replay.elapsed += time;
    while (replay.cursor < replay.frames.length && replay.times[replay.cursor] <= replay.elapsed) {
        const frame = replay.frames[replay.cursor++];
        for (let i = 0; i < frame[0]; i++) {
            const id = frame[i * 8 + 1];
            if (frame[i * 8 + 2] === -1) replay.asleep.push(id);
            else replay.moved.set(id, frame.slice(i * 8 + 2, i * 8 + 9));
        }
    }
    let out = 0;
    const sent = new Set();
    for (const [id, transform] of replay.moved) {
        const mine = local(id);
        if (mine === undefined) continue;
        k[out * 8 + 1] = mine;
        for (let j = 0; j < 7; j++) k[out * 8 + 2 + j] = transform[j];
        out++;
        sent.add(id);
        replay.moved.delete(id);
    }
    // The result is read from where a die is when it falls asleep, so that comes after its last move
    replay.asleep = replay.asleep.filter((id) => {
        const mine = local(id);
        if (mine === undefined || sent.has(id) || replay.moved.has(id)) return true;
        k[out * 8 + 1] = mine;
        k[out * 8 + 2] = -1;
        out++;
        return false;
    });
    k[0] = out;
    if (replay.cursor >= replay.frames.length && replay.moved.size === 0 && replay.asleep.length === 0) {
        __diceReplay = null;
    }
};
`;

/** Where the code goes in the minified worker of dice-box 1.1.4 */
const PATCHES: [string, string][] = [
    ["const Wt={size:9.5", `${WORKER_CODE}const Wt={size:9.5`],
    [
        'case"addDie":t.data.options.newStartPoint&&fe();',
        'case"addDie":if(__diceAdded(t.data.options.id))break;t.data.options.newStartPoint&&fe();',
    ],
    [
        "!ee&&k.byteLength&&(Tl(t),ce.postMessage(",
        "!ee&&k.byteLength&&(__diceReplay?__diceReplayStep(t):(Tl(t),__diceRecord(t)),ce.postMessage(",
    ],
];

/** Whether the physics worker could be patched, otherwise everyone only sees their own dice */
export let dice_sync_available = false;

function patch_physics(source: string) {
    let patched = source;
    for (const [original, replacement] of PATCHES) {
        if (patched.split(original).length !== 2) {
            console.warn(
                "Sharing dice is off, dice-box's physics worker changed:",
                original,
            );
            return null;
        }
        patched = patched.replace(original, () => replacement);
    }
    return patched;
}

if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    const NativeBlob = window.Blob;
    // dice-box makes a Blob of its physics worker's code and starts the worker from it
    window.Blob = class extends NativeBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
            const source =
                parts?.length === 1 && typeof parts[0] === "string"
                    ? parts[0]
                    : null;
            const patched =
                source?.includes("btDiscreteDynamicsWorld") &&
                source.includes('case"addDie"')
                    ? patch_physics(source)
                    : null;
            super(patched ? [patched] : parts, options);
            if (patched) dice_sync_available = true;
        }
    };
}

const channel =
    typeof window !== "undefined" && "BroadcastChannel" in window
        ? new BroadcastChannel(CHANNEL)
        : null;

/** Sends a command to the physics worker and waits for its answer, null if it doesn't answer */
function command(
    action: string,
    answer: string,
    data: Record<string, unknown> = {},
): Promise<any> {
    return new Promise((resolve) => {
        if (!channel || !dice_sync_available) return resolve(null);
        const timeout = setTimeout(() => {
            channel.removeEventListener("message", listener);
            resolve(null);
        }, 1000);
        const listener = (event: MessageEvent) => {
            if (event.data?.action !== answer) return;
            clearTimeout(timeout);
            channel.removeEventListener("message", listener);
            resolve(event.data);
        };
        channel.addEventListener("message", listener);
        channel.postMessage({ action, ...data });
    });
}

/** Call before throwing dice that others should see */
export async function start_recording() {
    return (await command("record", "recording")) !== null;
}

const FRAME_MS = 1000 / 60;

/** The recording of the dice thrown since start_recording, made small enough to send */
export async function finish_recording(
    look: Pick<DiceReplay, "notation" | "theme" | "themeColor">,
): Promise<DiceReplay | null> {
    const recorded = await command("finish", "recorded");
    if (!recorded || recorded.frames.length === 0) return null;
    const frames: number[][] = recorded.frames;
    const times: number[] = recorded.times;
    const falls_asleep = (frame: number[]) =>
        frame.some((value, i) => i % 8 === 2 && value === -1);

    // 60 frames a second are enough, but every die's last position and its falling
    // asleep have to stay: the result is read from them
    const replay: DiceReplay = {
        ...look,
        ids: recorded.ids,
        times: [],
        frames: [],
    };
    let last_kept = -Infinity;
    frames.forEach((frame, i) => {
        const keep =
            i === frames.length - 1 ||
            falls_asleep(frame) ||
            (i + 1 < frames.length && falls_asleep(frames[i + 1])) ||
            times[i] - last_kept >= FRAME_MS;
        if (!keep) return;
        last_kept = times[i];
        replay.times.push(Math.round(times[i]));
        replay.frames.push(
            frame.map((value, j) =>
                j % 8 === 1 || j === 0 ? value : Math.round(value * 1e4) / 1e4,
            ),
        );
    });
    return replay;
}

/** Ends a replay that didn't finish, e.g. because its dice never landed */
export function stop_replay() {
    if (channel && dice_sync_available) channel.postMessage({ action: "stop" });
}

/** Call before throwing the dice of the replay, they then move like the recorded ones */
export async function start_replay(replay: DiceReplay) {
    return (
        (await command("replay", "replaying", {
            ids: replay.ids,
            times: replay.times,
            frames: replay.frames,
        })) !== null
    );
}

/** How long the recorded roll took */
export function replay_duration(replay: DiceReplay) {
    return replay.times.at(-1) ?? 0;
}
