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

export const mouseDown = $state({value: false});

export const appState = $state({
    token: null as string | null,
    ws: null as WebSocket | null,
    store: null as any,
    secure: true,
    base_url: "dnd.wiegraebe.dev",
    selected_tool: Tools.None,
    dragging: false,
    prev_zoom: 1,
    zoom: 1,
});

export const gameState = $state({
    name: "Unknown Player",
    dm: false,
    scene: null as SceneData | null,
    scenes: [] as Scene[],
    resources: new SvelteSet() as SvelteSet<string>,
    pressure: false,
    users: [] as User[],
    locked_markers: {} as Record<string, string>,
    marker_lib: [] as MarkerTemplate[],
    characters: [] as any[]
});

export const fogState = $state({
    selected_player: "all"
});

export async function ensureStore() {
    if (!appState.store) {
        appState.store = await load('store.json', { autoSave: false });
    }
}

export const mouseX = new Tween(0, {
    duration: 200,
    easing: circOut
});
export const mouseY = new Tween(0, {
    duration: 200,
    easing: circOut
});
export const DMName = $state({value: ""});
export const showMouse = $state({value: false});
export const largeMouse = $state({value: false});
export const markerModal: {value: HTMLDialogElement | null} = $state({value: null});
export const characterImportModal: {value: HTMLDialogElement | null} = $state({value: null});
export const characters_open = $state({value: false});
export const character_open = $state({value: ""});

export function getCharacter(character: string) {
    return gameState.characters.find((char) => char.name === character);
}

export const roller: any = $state({value: null});