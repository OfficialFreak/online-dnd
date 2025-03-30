import { load } from "@tauri-apps/plugin-store";

export const userState = $state({
    ws: null,
    store: await load('store.json', { autoSave: false }),
    base_url: "localhost:3030"
})