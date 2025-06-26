import type { SceneData, Scene, User, MarkerTemplate } from "$lib/types/messaging/server_messages";
import { load } from "@tauri-apps/plugin-store";
import type WebSocket from "@tauri-apps/plugin-websocket";
import { circOut } from "svelte/easing";
import { Tween } from "svelte/motion";
import {SvelteSet} from "svelte/reactivity";	

export enum Tools {
    None,
    Pointer,
    AddFog,
    RemoveFog,
    Ruler
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
});

export const mouseX = new Tween(0, {
    duration: 8,
    easing: circOut
});

export const mouseY = new Tween(0, {
    duration: 8,
    easing: circOut
});

export const modals: Record<string, HTMLDialogElement | null> = $state({
    markerModal: null,
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