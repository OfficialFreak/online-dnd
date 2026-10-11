import type {
    SceneData,
    SceneState,
    Scene,
    User,
    MarkerTemplate,
} from "$lib/types/messaging/server_messages";
import { load } from "@tauri-apps/plugin-store";
import type WebSocket from "@tauri-apps/plugin-websocket";
import { circOut } from "svelte/easing";
import { Tween } from "svelte/motion";
import { SvelteSet } from "svelte/reactivity";
import {
    ActivateScene,
    DeleteMarker,
    DeleteScene,
    PutScene,
} from "./types/messaging/client_messages";
import { MessageTypes, notify } from "./notifications.svelte";

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
    for (const name of Object.keys(pointers)) delete pointers[name];
};

export type Pointer = {
    x: Tween<number>;
    y: Tween<number>;
    visible: boolean;
    large: boolean;
};

/** The pointers of the DMs, by name. There can be more than one DM. */
export const pointers: Record<string, Pointer> = $state({});
const pointer_timeouts = new Map<
    string,
    { hide?: ReturnType<typeof setTimeout>; shrink?: ReturnType<typeof setTimeout> }
>();

/**
 * Shows a DM's pointer for a moment. x and y are fractions of the map, without them
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
    /** With a path, that file is uploaded as the new scene's map */
    scene: { open(map_path?: string): void } | null;
    /** With a path, that file is uploaded as the new marker's image */
    marker: { open(image_path?: string): void } | null;
} = { scene: null, marker: null };

export type Panel = "characters" | "markers" | "scenes";

export const toolbarState = $state({
    panel: null as Panel | null,
    characterOpen: "",
});

export function togglePanel(panel: Panel) {
    toolbarState.panel = toolbarState.panel === panel ? null : panel;
}

export const fogState = $state({
    selected_player: "all",
});

export const roller: any = $state({ value: null });

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
    gameState.scene.state.turn = sorted_initiative[previous][1];
    await update_initiative();
}

export async function update_initiative() {
    if (!appState.ws || !gameState.scene) return;
    await appState.ws.send(
        PutScene.update_initiative(
            gameState.scene.state.initiative,
            gameState.scene.state.turn,
        ),
    );
}

/** Puts a marker from the library into the active scene. x and y are fractions of the map size. */
export async function add_marker(marker: MarkerTemplate, x = 0, y = 0) {
    if (!appState.ws || !gameState.scene) return;
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

export async function delete_marker_template(name: string) {
    if (!appState.ws) return;
    await appState.ws.send(DeleteMarker.create(name));
    notify("Marker gelöscht", MessageTypes.Success, 3000);
}
