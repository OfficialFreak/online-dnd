import type { SceneData, Scene, User, MarkerTemplate } from "$lib/types/messaging/server_messages";
import { load } from "@tauri-apps/plugin-store";
import type WebSocket from "@tauri-apps/plugin-websocket";
import { circOut } from "svelte/easing";
import { Tween } from "svelte/motion";
import {SvelteSet} from "svelte/reactivity";	
import { PutScene } from "./types/messaging/client_messages";

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
    prevZoom: 1,
    zoom: 1,
    ctrlPressed: false,
    verticalSnapPoint: 1,
    mouseDown: false,
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
    DMName: "",
    showMouse: false,
    largeMouse: false,
    combat: false
});

export const mouseX = new Tween(0, {
    duration: 50,
    easing: circOut
});

export const mouseY = new Tween(0, {
    duration: 50,
    easing: circOut
});

export const modals: Record<string, HTMLDialogElement | null> = $state({
    markerModal: null,
    sceneChooserModal: null,
    characterImportModal: null,
});

export const toolbarState = $state({
    charactersOpen: false,
    characterOpen: ""
})

export const fogState = $state({
    selected_player: "all"
});

export const roller: any = $state({value: null});

export async function ensureStore() {
    if (!appState.store) {
        appState.store = await load('store.json', { autoSave: false });
    }
}

export function getCharacter(character: string) {
    return gameState.characters.find((char) => char.name === character);
}

const sorted_initiative = $derived(
    gameState.scene?.state.initiative.toSorted((a, b) => b[0] - a[0]),
);

export const get_sorted_initiative = () => sorted_initiative;

const own_character = $derived(getCharacter(gameState.name));

export const get_own_character = () => own_character;

export async function advance_turn() {
    if (
        !gameState.combat ||
        !(
            gameState.dm ||
            own_character?.name === gameState.scene?.state.turn
        ) ||
        !gameState.scene
    )
        return;

    // Advance turn
    let index = sorted_initiative?.findIndex(
        (initiative) => initiative[1] === gameState.scene?.state.turn,
    );

    if (typeof index !== "number" || !sorted_initiative) return;
    if (index === sorted_initiative.length - 1) {
        index = 0;
    } else {
        index++;
    }
    gameState.scene.state.turn = sorted_initiative[index][1];
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