import type {
    SceneData,
    SceneState,
    Marker,
    Scene,
    User,
    MarkerTemplate,
    Weather,
} from "$lib/types/messaging/server_messages";
import { load_store, type KeyValueStore } from "./platform";
import type { GameSocket } from "./connection.svelte";
import { circOut } from "svelte/easing";
import { Tween } from "svelte/motion";
import { SvelteSet } from "svelte/reactivity";
import { spill_blood } from "./effects";
import {
    ActivateScene,
    Blood,
    DeleteCharacter,
    DeleteMarker,
    DeleteScene,
    InitiativeEntries,
    PutScene,
    PutWalls,
    SetTurn,
    SetVision,
    SetWeather,
} from "./types/messaging/client_messages";
import { CLEAR } from "./weather";
import { MessageTypes, notify } from "./notifications.svelte";
import type { RollEntry, RollMode } from "./rolls";
import { roll_initiative } from "./monsters";
import { DRAWING_COLORS, type DrawingKind } from "./drawings";
import type { LightPreset } from "./lighting";
import type { AssetInfo, AssetKind } from "./assets";

export enum Tools {
    None,
    Pointer,
    AddFog,
    RemoveFog,
    Ruler,
    Draw,
    /** Selects markers like Shift does, for phones and tablets */
    Select,
    /** Draws and removes the walls and doors that block the players' sight */
    Walls,
    /** Wiped over the map, deletes every drawing it touches */
    Erase,
}

export const appState = $state({
    token: null as string | null,
    ws: null as GameSocket | null,
    store: null as any as KeyValueStore,
    secure: true,
    baseUrl: "dnd.wiegraebe.dev",
    selectedTool: Tools.None,
    dragging: false,
    /** How large the map is shown */
    zoom: 1,
    /**
     * The zoom the map is laid out at, so it is drawn sharp. It follows the zoom once a
     * zoom gesture ends, in between the map is scaled by zoom / layout_zoom.
     */
    layout_zoom: 1,
    /** Zooms the map around the window center, set by the map that is shown */
    zoom_by: null as ((factor: number) => void) | null,
    /** Ends a marker's drag, putting it back where it was, see updates.svelte.ts */
    end_drag: null as (() => void) | null,
    /** Height divided by width of the shown map */
    map_aspect: null as number | null,
    ctrlPressed: false,
    mouseDown: false,
    /** The toolbar and the buttons of the title bar, folded away until opened */
    controls_open: false,
    /** Weather over the map, everyone can turn it off for themselves */
    show_weather: true,
    /** Glowing, sparks and flames of conditions, off on devices they slow down */
    motion: true,
    /** Smoke and the scene's name on a scroll when the DM changes the scene */
    scene_intro: true,
    /** The map's colours glowing in the background around it */
    ambient: true,
    /** The marker whose menu a click or tap opened */
    open_marker_menu: null as string | null,
    theme: null as string | null,
    map_confetti_function: (() => {}) as () => {} as
        | (() => void)
        | ((args: Record<string, unknown>) => void),
});

export const gameState = $state({
    name: "Unknown Player",
    dm: false,
    scene: null as SceneData | null,
    scenes: [] as Scene[],
    resources: new SvelteSet() as SvelteSet<string>,
    pressure: false,
    users: [] as User[],
    lockedMarkers: {} as Record<string, string>,
    markerLib: [] as MarkerTemplate[],
    characters: [] as any[],
    /** Shown on pointers from old clients, which don't send whose pointer it is */
    DMName: "",
    combat: false,
    /** Oldest first */
    rolls: [] as RollEntry[],
});

export const resetGamestate = () => {
    gameState.name = "Unknown Player";
    gameState.dm = false;
    gameState.scene = null;
    gameState.scenes = [];
    gameState.resources = new SvelteSet();
    gameState.pressure = false;
    gameState.users = [];
    gameState.lockedMarkers = {};
    gameState.markerLib = [];
    gameState.characters = [];
    gameState.DMName = "";
    gameState.combat = false;
    gameState.rolls = [];
    for (const name of Object.keys(pointers)) delete pointers[name];
};

export type Pointer = {
    x: Tween<number>;
    y: Tween<number>;
    visible: boolean;
    large: boolean;
};

/** The pointers of everyone else, by name */
export const pointers: Record<string, Pointer> = $state({});
const pointer_timeouts = new Map<
    string,
    { hide?: ReturnType<typeof setTimeout>; shrink?: ReturnType<typeof setTimeout> }
>();

/**
 * Shows someone's pointer for a moment. x and y are fractions of the map, without them
 * the pointer stays where it was. A large pointer is a click to get attention.
 */
export function show_pointer(name: string, x?: number, y?: number, large = false) {
    if (!pointers[name]) {
        pointers[name] = {
            x: new Tween(x ?? 0, { duration: 50, easing: circOut }),
            y: new Tween(y ?? 0, { duration: 50, easing: circOut }),
            visible: false,
            large: false,
        };
    }
    const pointer = pointers[name];
    if (x !== undefined && y !== undefined) {
        pointer.x.target = x;
        pointer.y.target = y;
    }
    pointer.visible = true;

    const timeouts = pointer_timeouts.get(name) ?? {};
    clearTimeout(timeouts.hide);
    timeouts.hide = setTimeout(() => (pointer.visible = false), 500);
    if (large) {
        pointer.large = true;
        clearTimeout(timeouts.shrink);
        timeouts.shrink = setTimeout(() => (pointer.large = false), 1000);
    }
    pointer_timeouts.set(name, timeouts);
}

export const modals: Record<string, HTMLDialogElement | null> = $state({
    characterImportModal: null,
});

/** Registered by the scene and marker dialogs, which only DMs have */
export const dialogs: {
    scene: {
        /** With a path, that file is uploaded as the new scene's map */
        open(map_path?: string): void;
        edit(scene: Scene): void;
    } | null;
    marker: {
        /** With a path, that file is uploaded as the new marker's image */
        open(image_path?: string): void;
        edit(marker: MarkerTemplate): void;
        /** A new marker with these values, e.g. from a monster */
        create_from(template: Partial<MarkerTemplate>): void;
    } | null;
    monster: {
        /** Searching monsters to make markers of */
        open(): void;
        /** The stat block of a monster */
        show(key: string): void;
    } | null;
    assets: {
        /** Managing the uploaded files */
        open(): void;
        /** Choosing an uploaded file, null if none was chosen */
        pick(kinds: AssetKind[]): Promise<string | null>;
    } | null;
    /** Managing players and their keys */
    users: { open(): void } | null;
} = { scene: null, marker: null, monster: null, assets: null, users: null };

export type AdminUser = {
    name: string;
    dm: boolean;
    key?: string | null;
    online: boolean;
    has_character: boolean;
};

/** All users with their keys, only DMs get them */
export const adminState = $state({
    users: [] as AdminUser[],
    /** Whose recordings everyone hears who recorded none of their own */
    default_voice: null as string | null,
});

/** The files on the server, the DM asks for them in the file browser */
export const assetState = $state({ assets: [] as AssetInfo[] });

export type Panel = "characters" | "markers" | "scenes" | "rolls" | "sounds";

export const toolbarState = $state({
    panel: null as Panel | null,
    characterOpen: "",
});

export function togglePanel(panel: Panel) {
    toolbarState.panel = toolbarState.panel === panel ? null : panel;
}

/** Shows or folds away the controls, and remembers it on this device */
export async function set_controls_open(open: boolean) {
    appState.controls_open = open;
    // Folded away, nothing of them stays active unseen
    if (!open) {
        toolbarState.panel = null;
        appState.selectedTool = Tools.None;
    }
    await ensureStore();
    await appState.store.set("controls_open", { value: open });
    await appState.store.save();
}

export async function set_motion(motion: boolean) {
    appState.motion = motion;
    await ensureStore();
    await appState.store.set("motion", { value: motion });
    await appState.store.save();
}

export async function set_ambient(shown: boolean) {
    appState.ambient = shown;
    await ensureStore();
    await appState.store.set("ambient", { value: shown });
    await appState.store.save();
}

export async function set_scene_intro(shown: boolean) {
    appState.scene_intro = shown;
    await ensureStore();
    await appState.store.set("scene_intro", { value: shown });
    await appState.store.save();
}

export async function set_show_weather(show: boolean) {
    appState.show_weather = show;
    await ensureStore();
    await appState.store.set("show_weather", { value: show });
    await appState.store.save();
}

/** What the drawing tool draws next */
export const drawState = $state({
    kind: "circle" as DrawingKind,
    color: DRAWING_COLORS[0],
    /** Snaps to the grid like Ctrl, which phones and tablets don't have */
    snap: false,
});

export const wallState = $state({
    mode: "wall" as "wall" | "door" | "light" | "erase",
    /** What a light placed with the wall tool is */
    light: "torch" as LightPreset,
});

export const fogState = $state({
    /**
     * The player the DM looks at the map as: their fog, what their figures see, without
     * hidden markers. The fog tool paints only for them. "all" is the DM's own view.
     */
    selected_player: "all",
    /** Paint cell by cell or fill a rectangle, Shift draws a rectangle too */
    shape: "brush" as "brush" | "rect",
    /** Width of the brush in cells */
    brush: 1,
});

export const roller: any = $state({ value: null });

const MAX_ROLLS = 200;

export function remember_roll(roll: RollEntry) {
    // How the dice moved is big and only needed while they roll
    const { replay, ...entry } = roll;
    gameState.rolls.push({ ...entry, time: roll.time ?? Date.now() } as RollEntry);
    if (gameState.rolls.length > MAX_ROLLS) {
        gameState.rolls.splice(0, gameState.rolls.length - MAX_ROLLS);
    }
}

/** Advantage or disadvantage for the next roll with a single d20 */
export const rollState = $state({ mode: "normal" as RollMode });

export async function ensureStore() {
    if (!appState.store) {
        appState.store = await load_store();
    }
}

export function getCharacter(character: string) {
    return gameState.characters.find((char) => char.name === character);
}

const sorted_initiative = $derived(
    gameState.scene?.state.initiative.toSorted((a, b) => b[0] - a[0]),
);

export const get_sorted_initiative = () => sorted_initiative;

const own_character = $derived(
    gameState.characters.find((char) => char.player_name === gameState.name),
);

export const get_own_character = () => own_character;

export async function advance_turn() {
    if (
        !gameState.combat ||
        !(
            gameState.dm || own_character?.name === gameState.scene?.state.turn
        ) ||
        !gameState.scene
    )
        return;

    if (!sorted_initiative?.length) return;

    // Advance turn. If it is nobody's turn (or the marker left the initiative), start at the top.
    const index = sorted_initiative.findIndex(
        (initiative) => initiative[1] === gameState.scene?.state.turn,
    );
    const next = index === -1 ? 0 : (index + 1) % sorted_initiative.length;
    // Everyone had their turn, back to the first one in a new round
    const round =
        index !== -1 && next === 0 ? current_round() + 1 : current_round();
    await set_turn(sorted_initiative[next][1], round);
}

/** Goes back one turn, used by the DM to undo an accidental advance */
export async function previous_turn() {
    if (!gameState.combat || !gameState.dm || !gameState.scene) return;
    if (!sorted_initiative?.length) return;

    const index = sorted_initiative.findIndex(
        (initiative) => initiative[1] === gameState.scene?.state.turn,
    );
    const previous =
        index <= 0 ? sorted_initiative.length - 1 : index - 1;
    // Going back past the first one undoes the start of the round
    const round =
        index === 0 ? Math.max(1, current_round() - 1) : current_round();
    // From nobody's turn there is no turn to undo
    await set_turn(sorted_initiative[previous][1], round, index !== -1);
}

/**
 * Moves the turn on. The server only takes it if the turn is still the one this client
 * saw, so two people ending the same turn at once don't skip the next one.
 */
async function set_turn(turn: string | null, round: number, back = false) {
    if (!appState.ws || !gameState.scene) return;
    const from = gameState.scene.state.turn ?? null;
    gameState.scene.state.turn = turn;
    gameState.scene.state.round = round;
    await appState.ws.send(SetTurn.create(from, turn, round, back));
}

/** Who has the turn once these markers left the initiative, the next one if it was theirs */
function turn_without(names: string[]) {
    const turn = gameState.scene?.state.turn ?? null;
    if (!sorted_initiative || !turn || !names.includes(turn)) return turn;
    const index = sorted_initiative.findIndex((entry) => entry[1] === turn);
    for (let step = 1; step < sorted_initiative.length; step++) {
        const [, name] = sorted_initiative[(index + step) % sorted_initiative.length];
        if (!names.includes(name)) return name;
    }
    return null;
}

/** Takes a marker out of the initiative, the next one gets the turn if it was its turn */
export async function remove_from_initiative(name: string) {
    const scene = gameState.scene;
    if (!scene) return;
    record_undo();
    scene.state.turn = turn_without([name]);
    scene.state.initiative = scene.state.initiative.filter(
        (entry) => entry[1] !== name,
    );
    await update_initiative();
}

/** The combat round of the active scene, counting from 1 */
export function current_round() {
    return gameState.scene?.state.round ?? 1;
}

/** Starts counting rounds again, e.g. when a new combat starts */
export async function reset_round() {
    if (!gameState.scene) return;
    await set_turn(gameState.scene.state.turn ?? null, 1);
}

export async function update_initiative() {
    if (!appState.ws || !gameState.scene) return;
    await appState.ws.send(
        PutScene.update_initiative(
            gameState.scene.state.initiative,
            gameState.scene.state.turn,
            current_round(),
        ),
    );
}

/**
 * The initiative bonus of a marker: its character's from D&D Beyond or its monster's stat
 * block. Null for other markers, rolling d20 + 0 for them would only look right.
 */
export function initiative_bonus(
    marker: Pick<MarkerTemplate, "name" | "monster">,
): number | null {
    const character = getCharacter(marker.name);
    if (character) return character.actualInitiative as number;
    return marker.monster?.initiative_bonus ?? null;
}

/**
 * Puts a marker that isn't in the initiative yet into it. Without a value it is rolled,
 * which needs a known bonus.
 */
export async function add_to_initiative(
    marker: Pick<MarkerTemplate, "name" | "monster">,
    value?: number,
) {
    if (!gameState.scene) return;
    if (gameState.scene.state.initiative.some((entry) => entry[1] === marker.name)) return;
    const bonus = initiative_bonus(marker);
    if (value === undefined && bonus === null) return;
    record_undo();
    let total = value;
    if (total === undefined) {
        const rolled = roll_initiative(bonus!);
        total = rolled.total;
        notify(
            `${marker.name}: Initiative ${total} (${rolled.roll} ${bonus! < 0 ? "−" : "+"} ${Math.abs(bonus!)})`,
            MessageTypes.Info,
            3000,
        );
    }
    gameState.scene.state.initiative.push([total, marker.name]);
    await appState.ws?.send(InitiativeEntries.create([[total, marker.name]]));
}

/**
 * Rolls initiative for the markers on the map that aren't in it yet and whose bonus is
 * known: characters and monsters from the library. The DM enters the others' in their menu.
 */
export async function roll_known_initiative() {
    const scene = gameState.scene;
    if (!scene) return;
    const missing = scene.state.markers.filter(
        (marker) => !scene.state.initiative.some((entry) => entry[1] === marker.name),
    );
    const entries: [number, string][] = [];
    for (const marker of missing) {
        const bonus = initiative_bonus(marker);
        if (bonus !== null) entries.push([roll_initiative(bonus).total, marker.name]);
    }
    const unknown = missing.length - entries.length;
    const skipped =
        unknown === 1
            ? "Ein Marker ohne bekannten Bonus, trag seine Initiative in seinem Menü ein"
            : `${unknown} Marker ohne bekannten Bonus, trag ihre Initiative in ihrem Menü ein`;
    if (entries.length === 0) {
        notify(
            unknown > 0 ? skipped : "Alle sind schon in der Initiative",
            MessageTypes.Info,
            unknown > 0 ? 4000 : 2000,
        );
        return;
    }
    record_undo();
    scene.state.initiative.push(...entries);
    notify(
        `Initiative für ${entries.length} gewürfelt` + (unknown > 0 ? `. ${skipped}` : ""),
        MessageTypes.Success,
        unknown > 0 ? 4000 : 2000,
    );
    await appState.ws?.send(InitiativeEntries.create(entries));
}

/** Names of the markers the DM selected, to move or remove them together */
export const selection = new SvelteSet<string>();

export function toggle_selected(name: string) {
    if (selection.has(name)) selection.delete(name);
    else selection.add(name);
}

/** Removes markers from the active scene, with blood for everyone */
export async function remove_markers(names: string[]) {
    const scene = gameState.scene;
    if (!scene || names.length === 0) return;
    record_undo();
    for (const name of names) {
        const index = scene.state.markers.findIndex(
            (marker) => marker.name === name,
        );
        if (index === -1) continue;
        const marker = scene.state.markers[index];
        scene.state.turn = turn_without([name]);
        const size = marker.size / scene.columns;
        spill_blood(marker.x.target, marker.y.target, size);
        // Players would see blood where a hidden marker stood
        if (!marker.hidden) {
            appState.ws?.send(
                Blood.create(marker.x.target, marker.y.target, size),
            );
        }
        scene.state.markers.splice(index, 1);
        scene.state.initiative = scene.state.initiative.filter(
            (entry) => entry[1] !== name,
        );
        selection.delete(name);
    }
    await save_scene();
}

/** The active scene as it was, to undo changes of the DM */
type SceneSnapshot = {
    scene: string;
    state: Omit<SceneState, "markers"> & { markers: Marker[] };
    weather: Weather | null;
};

const MAX_UNDO = 50;
const undo_stack: SceneSnapshot[] = [];
const redo_stack: SceneSnapshot[] = [];
export const undoState = $state({ undo: 0, redo: 0 });

function snapshot(): SceneSnapshot | null {
    const scene = gameState.scene;
    if (!scene) return null;
    return {
        scene: scene.name,
        state: {
            ...$state.snapshot({
                fog_squares: scene.state.fog_squares,
                initiative: scene.state.initiative,
                turn: scene.state.turn,
                round: scene.state.round,
                walls: scene.state.walls ?? [],
                doors: scene.state.doors ?? [],
                lights: scene.state.lights ?? [],
                vision: scene.state.vision ?? false,
                lighting: scene.state.lighting ?? "bright",
            }),
            // The positions are tweens, only where they are going counts
            markers: scene.state.markers.map(({ x, y, ...marker }) => ({
                ...$state.snapshot(marker),
                x: x.target,
                y: y.target,
            })),
        },
        weather: $state.snapshot(scene.weather ?? null),
    };
}

function update_undo_state() {
    undoState.undo = undo_stack.length;
    undoState.redo = redo_stack.length;
}

/** Remembers the active scene before the DM changes it, so the change can be undone */
export function record_undo() {
    if (!gameState.dm) return;
    const current = snapshot();
    if (!current) return;
    // Focusing a field records too, even if nothing changes in the end
    const latest = undo_stack.at(-1);
    if (latest && JSON.stringify(latest) === JSON.stringify(current)) return;
    undo_stack.push(current);
    if (undo_stack.length > MAX_UNDO) undo_stack.shift();
    redo_stack.length = 0;
    update_undo_state();
}

/** Takes the latest snapshot of the active scene, older scenes' snapshots are dropped */
function take(stack: SceneSnapshot[]) {
    let taken = stack.pop();
    while (taken && taken.scene !== gameState.scene?.name) taken = stack.pop();
    return taken;
}

async function restore(saved: SceneSnapshot) {
    const scene = gameState.scene;
    if (!scene || !appState.ws) return;
    const before = snapshot();
    scene.state = {
        // Drawings change through their own messages and stay
        ...scene.state,
        ...saved.state,
        markers: saved.state.markers.map((marker) => ({
            ...marker,
            x: new Tween(marker.x, { duration: 50, easing: circOut }),
            y: new Tween(marker.y, { duration: 50, easing: circOut }),
        })),
    };
    scene.weather = saved.weather;
    // Saving the whole scene sends it to everyone again
    await save_scene();
    // Walls, sight and weather the server keeps apart, it only takes them on their own
    const changed = (pick: (state: SceneSnapshot) => unknown) =>
        JSON.stringify(pick(saved)) !== JSON.stringify(before && pick(before));
    if (changed((s) => [s.state.walls, s.state.doors, s.state.lights])) {
        await appState.ws.send(
            PutWalls.create(scene.name, saved.state.walls ?? [], saved.state.doors ?? [], {
                lights: saved.state.lights ?? [],
            }),
        );
    }
    if (changed((s) => [s.state.vision, s.state.lighting])) {
        await appState.ws.send(
            SetVision.create({
                enabled: saved.state.vision ?? false,
                lighting: saved.state.lighting ?? "bright",
            }),
        );
    }
    if (changed((s) => s.weather)) {
        await appState.ws.send(SetWeather.create(saved.weather ?? CLEAR));
    }
}

export async function undo() {
    const current = snapshot();
    const saved = take(undo_stack);
    if (!saved || !current) {
        update_undo_state();
        return;
    }
    redo_stack.push(current);
    update_undo_state();
    await restore(saved);
    notify("Rückgängig gemacht", MessageTypes.Neutral, 1000);
}

export async function redo() {
    const current = snapshot();
    const saved = take(redo_stack);
    if (!saved || !current) {
        update_undo_state();
        return;
    }
    undo_stack.push(current);
    update_undo_state();
    await restore(saved);
    notify("Wiederhergestellt", MessageTypes.Neutral, 1000);
}

/** Puts a marker from the library into the active scene. x and y are fractions of the map size. */
export async function add_marker(marker: MarkerTemplate, x = 0, y = 0) {
    if (!appState.ws || !gameState.scene) return;
    record_undo();
    let new_marker = {
        ...marker,
        x: new Tween(x, {
            duration: 50,
            easing: circOut,
        }),
        y: new Tween(y, {
            duration: 50,
            easing: circOut,
        }),
        status_effects: [],
        hp: marker.max_hp ?? null,
    };
    let i = 1;
    while (
        gameState.scene.state.markers.some(
            (marker) =>
                marker.name ===
                new_marker.name + (i === 1 ? "" : ` ${i.toString()}`),
        )
    ) {
        i++;
    }
    new_marker.name = new_marker.name + (i === 1 ? "" : ` ${i.toString()}`);
    gameState.scene.state.markers.push(new_marker);
    await save_scene();
}

/** Sends the whole active scene, e.g. after adding or moving markers */
async function save_scene() {
    if (!appState.ws || !gameState.scene) return;
    let serialized_fog: SceneState["fog_squares"] = {};
    for (const [person, values] of Object.entries(
        gameState.scene.state.fog_squares,
    )) {
        serialized_fog[person] = Array.from(values);
    }

    await appState.ws.send(
        PutScene.update({
            ...gameState.scene,
            state: {
                ...gameState.scene.state,
                fog_squares: serialized_fog,
            },
        }),
    );
}

/** The marker of a character, it has the character's name */
export function character_marker(name: string) {
    return gameState.markerLib.find((marker) => marker.name === name);
}

/** Puts the markers of all characters in a circle around the middle of the map */
export async function place_party() {
    const scene = gameState.scene;
    if (!appState.ws || !scene) return;

    const party = gameState.characters
        .map((character) => character_marker(character.name))
        .filter((marker) => marker !== undefined);
    if (party.length === 0) {
        notify(
            "Für die Charaktere gibt es noch keine Marker",
            MessageTypes.Warning,
            3000,
        );
        return;
    }
    record_undo();

    // Everything in grid cells, the map is `columns` cells wide
    const columns = scene.columns;
    const rows = appState.map_aspect
        ? columns * appState.map_aspect
        : scene.rows - 1;
    const biggest = Math.max(...party.map((marker) => marker.size));
    // Far enough out that neighbours don't overlap
    const radius =
        party.length === 1
            ? 0
            : Math.max(biggest, (party.length * biggest * 1.3) / (2 * Math.PI));

    party.forEach((template, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / party.length;
        const x =
            (columns / 2 + radius * Math.cos(angle) - template.size / 2) /
            columns;
        const y =
            (rows / 2 + radius * Math.sin(angle) - template.size / 2) / rows;

        const existing = scene.state.markers.find(
            (marker) => marker.name === template.name,
        );
        if (existing) {
            existing.x.set(x);
            existing.y.set(y);
        } else {
            scene.state.markers.push({
                ...template,
                x: new Tween(x, { duration: 50, easing: circOut }),
                y: new Tween(y, { duration: 50, easing: circOut }),
                status_effects: [],
            });
        }
    });

    await save_scene();
    notify("Party platziert", MessageTypes.Success, 2000);
}

export async function activate_scene(name: string) {
    if (!appState.ws) return;
    await appState.ws.send(ActivateScene.create(name));
    notify("Szene aktiviert", MessageTypes.Success, 1500);
}

export async function delete_scene(name: string) {
    if (!appState.ws) return;
    await appState.ws.send(DeleteScene.create(name));
    notify("Szene gelöscht", MessageTypes.Success, 3000);
}

/** Removes a character from the game. Its marker stays in the marker library. */
export async function delete_character(id: number) {
    if (!appState.ws) return;
    await appState.ws.send(DeleteCharacter.create(id));
    notify("Charakter gelöscht", MessageTypes.Success, 3000);
}

export async function delete_marker_template(name: string) {
    if (!appState.ws) return;
    await appState.ws.send(DeleteMarker.create(name));
    notify("Marker gelöscht", MessageTypes.Success, 3000);
}
