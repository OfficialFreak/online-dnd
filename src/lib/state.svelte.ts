import type {
    SceneData,
    SceneState,
    Marker,
    Scene,
    User,
    MarkerTemplate,
} from "$lib/types/messaging/server_messages";
import { load } from "@tauri-apps/plugin-store";
import type WebSocket from "@tauri-apps/plugin-websocket";
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
    PutScene,
} from "./types/messaging/client_messages";
import { MessageTypes, notify } from "./notifications.svelte";
import type { RollEntry, RollMode } from "./rolls";
import { roll_initiative } from "./monsters";

export enum Tools {
    None,
    Pointer,
    AddFog,
    RemoveFog,
    Ruler,
}

export const appState = $state({
    token: null as string | null,
    ws: null as WebSocket | null,
    store: null as any,
    secure: true,
    baseUrl: "dnd.wiegraebe.dev",
    selectedTool: Tools.None,
    dragging: false,
    zoom: 1,
    /** Zooms the map around the window center, set by the map that is shown */
    zoom_by: null as ((factor: number) => void) | null,
    /** Height divided by width of the shown map */
    map_aspect: null as number | null,
    ctrlPressed: false,
    mouseDown: false,
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
} = { scene: null, marker: null, monster: null };

export type Panel = "characters" | "markers" | "scenes" | "rolls";

export const toolbarState = $state({
    panel: null as Panel | null,
    characterOpen: "",
});

export function togglePanel(panel: Panel) {
    toolbarState.panel = toolbarState.panel === panel ? null : panel;
}

export const fogState = $state({
    selected_player: "all",
    /** Paint cell by cell or fill a rectangle, Shift draws a rectangle too */
    shape: "brush" as "brush" | "rect",
    /** Width of the brush in cells */
    brush: 1,
});

export const roller: any = $state({ value: null });

const MAX_ROLLS = 200;

export function remember_roll(roll: RollEntry) {
    gameState.rolls.push({ ...roll, time: roll.time ?? Date.now() });
    if (gameState.rolls.length > MAX_ROLLS) {
        gameState.rolls.splice(0, gameState.rolls.length - MAX_ROLLS);
    }
}

/** Advantage or disadvantage for the next roll with a single d20 */
export const rollState = $state({ mode: "normal" as RollMode });

export async function ensureStore() {
    if (!appState.store) {
        appState.store = await load("store.json", { autoSave: false });
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
    if (index !== -1 && next === 0) {
        gameState.scene.state.round = current_round() + 1;
    }
    gameState.scene.state.turn = sorted_initiative[next][1];
    await update_initiative();
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
    if (index === 0) {
        gameState.scene.state.round = Math.max(1, current_round() - 1);
    }
    gameState.scene.state.turn = sorted_initiative[previous][1];
    await update_initiative();
}

/** The combat round of the active scene, counting from 1 */
export function current_round() {
    return gameState.scene?.state.round ?? 1;
}

/** Starts counting rounds again, e.g. when a new combat starts */
export async function reset_round() {
    if (!gameState.scene) return;
    gameState.scene.state.round = 1;
    await update_initiative();
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

/** The initiative bonus of a marker: its character's or its monster's */
export function initiative_bonus(marker: Pick<MarkerTemplate, "name" | "monster">) {
    const character = getCharacter(marker.name);
    if (character) return character.actualInitiative as number;
    return marker.monster?.initiative_bonus ?? 0;
}

/** Rolls initiative for a marker that isn't in the initiative yet */
export async function add_to_initiative(marker: Pick<MarkerTemplate, "name" | "monster">) {
    if (!gameState.scene) return;
    if (gameState.scene.state.initiative.some((entry) => entry[1] === marker.name)) return;
    record_undo();
    const bonus = initiative_bonus(marker);
    const { roll, total } = roll_initiative(bonus);
    gameState.scene.state.initiative.push([total, marker.name]);
    notify(
        `${marker.name}: Initiative ${total} (${roll} ${bonus < 0 ? "−" : "+"} ${Math.abs(bonus)})`,
        MessageTypes.Info,
        3000,
    );
    await update_initiative();
}

/** Rolls initiative for all markers that aren't characters and aren't in the initiative yet */
export async function roll_npc_initiative() {
    const scene = gameState.scene;
    if (!scene) return;
    const npcs = scene.state.markers.filter(
        (marker) =>
            !getCharacter(marker.name) &&
            !scene.state.initiative.some((entry) => entry[1] === marker.name),
    );
    if (npcs.length === 0) {
        notify("Alle Marker sind schon in der Initiative", MessageTypes.Info, 2000);
        return;
    }
    record_undo();
    for (const marker of npcs) {
        scene.state.initiative.push([
            roll_initiative(initiative_bonus(marker)).total,
            marker.name,
        ]);
    }
    notify(`Initiative für ${npcs.length} Marker gewürfelt`, MessageTypes.Success, 2000);
    await update_initiative();
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
        const size = marker.size / scene.columns;
        spill_blood(marker.x.target, marker.y.target, size);
        appState.ws?.send(Blood.create(marker.x.target, marker.y.target, size));
        scene.state.markers.splice(index, 1);
        scene.state.initiative = scene.state.initiative.filter(
            (entry) => entry[1] !== name,
        );
        if (scene.state.turn === name) scene.state.turn = null;
        selection.delete(name);
    }
    await save_scene();
}

/** The active scene as it was, to undo changes of the DM */
type SceneSnapshot = {
    scene: string;
    state: Omit<SceneState, "markers"> & { markers: Marker[] };
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
            }),
            // The positions are tweens, only where they are going counts
            markers: scene.state.markers.map(({ x, y, ...marker }) => ({
                ...$state.snapshot(marker),
                x: x.target,
                y: y.target,
            })),
        },
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
    if (!gameState.scene) return;
    gameState.scene.state = {
        ...saved.state,
        markers: saved.state.markers.map((marker) => ({
            ...marker,
            x: new Tween(marker.x, { duration: 50, easing: circOut }),
            y: new Tween(marker.y, { duration: 50, easing: circOut }),
        })),
    };
    // Saving the whole scene sends it to everyone again
    await save_scene();
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
    record_undo();

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
