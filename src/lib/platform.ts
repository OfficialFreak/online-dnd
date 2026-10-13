// The app runs in Tauri on the desktop and as a web page in a browser, e.g. on a phone.
// What only Tauri can do is behind these checks.

/** Whether the app runs in Tauri, otherwise in a browser */
export const in_tauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Safari's engine, which every browser on an iPhone or iPad uses */
export const in_webkit =
    typeof navigator !== "undefined" && navigator.vendor === "Apple Computer, Inc.";

/** Calls a command of the Tauri backend, does nothing in a browser */
export async function invoke_tauri<T>(
    command: string,
    args?: Record<string, unknown>,
): Promise<T | undefined> {
    if (!in_tauri) return undefined;
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
}

/** Listens to an event of the Tauri backend, never fires in a browser */
export async function listen_tauri<T>(
    event: string,
    handler: (payload: T) => void,
) {
    if (!in_tauri) return;
    const { listen } = await import("@tauri-apps/api/event");
    await listen<T>(event, (event) => handler(event.payload));
}

/** A small key-value store, Tauri's store file or the browser's local storage */
export type KeyValueStore = {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    save(): Promise<void>;
};

const STORAGE_PREFIX = "dnd-online:";

export async function load_store(): Promise<KeyValueStore> {
    if (in_tauri) {
        const { load } = await import("@tauri-apps/plugin-store");
        return load("store.json", { autoSave: false });
    }
    return {
        async get(key) {
            const value = localStorage.getItem(STORAGE_PREFIX + key);
            return value === null ? undefined : JSON.parse(value);
        },
        async set(key, value) {
            localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
        },
        async save() {},
    };
}
