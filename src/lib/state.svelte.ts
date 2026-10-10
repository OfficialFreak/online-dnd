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
    sceneCreationModal: null,
    markerCreationModal: null,
    characterImportModal: null,
});

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
