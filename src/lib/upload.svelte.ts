import { fileTypeFromBlob } from "file-type";
import { appState } from "./state.svelte";
import { in_tauri } from "./platform";
import { MessageTypes, notify } from "./notifications.svelte";

// Keep in sync with MAX_UPLOAD_SIZE and MAX_VIDEO_SIZE in dnd-online-server/src/constants.rs
const MAX_UPLOAD_MB = 50;
const MAX_VIDEO_MB = 400;

/** While uploading, how much of the file the server has, from 0 to 1 */
export const uploadState = $state({ uploading: false, progress: null as number | null });

/** Uploads a file and returns the asset name it is stored under, or null if the upload failed. */
async function upload_file(
    selectedFilePath: string,
    selectedFileName: string,
): Promise<string | null> {
    // Read the file as binary
    let fileContent: Uint8Array;
    try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        fileContent = await readFile(selectedFilePath);
    } catch (e) {
        console.error("Reading upload failed", e);
        notify(
            "Die Datei konnte nicht gelesen werden.",
            MessageTypes.Error,
            5000,
        );
        return null;
    }
    return await upload_content(fileContent, selectedFileName);
}

/** Sends a file to the server, following the progress. Null if it wasn't reachable. */
function post_file(file: Blob, file_name: string) {
    return new Promise<{ status: number; text: string } | null>((resolve) => {
        const form = new FormData();
        form.append("file", file, file_name);
        const request = new XMLHttpRequest();
        request.open(
            "POST",
            `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets?key=${encodeURIComponent(appState.token ?? "")}`,
        );
        uploadState.progress = 0;
        request.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) uploadState.progress = event.loaded / event.total;
        });
        request.addEventListener("load", () =>
            resolve({ status: request.status, text: request.responseText }),
        );
        request.addEventListener("error", () => resolve(null));
        request.addEventListener("abort", () => resolve(null));
        request.send(form);
    }).finally(() => (uploadState.progress = null));
}

/**
 * Uploads the content of a file, see upload_file. A File a browser picked goes straight
 * from the disk, also in the desktop app: a video can be a few hundred MB.
 */
async function upload_content(
    content: Uint8Array | Blob,
    selectedFileName: string,
): Promise<string | null> {
    const file = content instanceof Blob ? content : new Blob([content as BlobPart]);
    if (!appState.token) {
        notify(
            "Hochladen fehlgeschlagen: Du bist nicht angemeldet.",
            MessageTypes.Error,
            5000,
        );
        return null;
    }

    // Fail fast, the upload would be rejected anyway
    const fileType = await fileTypeFromBlob(file).catch(() => undefined);
    const video = !!fileType?.mime.startsWith("video/");
    const max_mb = video ? MAX_VIDEO_MB : MAX_UPLOAD_MB;
    if (file.size > max_mb * 1_000_000) {
        notify(
            `Die Datei ist zu groß (maximal ${max_mb} MB).`,
            MessageTypes.Error,
            8000,
        );
        return null;
    }

    if (video) {
        notify(
            "Videos werden auf dem Server bei Bedarf umgewandelt, das kann ein paar Minuten dauern.",
            MessageTypes.Info,
            5000,
        );
    }

    const response = await post_file(file, selectedFileName);
    if (!response) {
        notify(
            "Hochladen fehlgeschlagen: Der Server ist nicht erreichbar.",
            MessageTypes.Error,
            8000,
        );
        return null;
    }

    if (response.status < 200 || response.status >= 300) {
        // The server answers with a message meant for the user
        const reason = response.text;
        console.error(`Upload failed: ${response.status}`, reason);
        notify(
            reason
                ? `Hochladen fehlgeschlagen: ${reason}`
                : `Hochladen fehlgeschlagen (Fehler ${response.status}).`,
            MessageTypes.Error,
            8000,
        );
        return null;
    }

    const asset = response.text;
    if (!asset) {
        notify(
            "Hochladen fehlgeschlagen: Der Server hat keinen Dateinamen zurückgegeben.",
            MessageTypes.Error,
            8000,
        );
        return null;
    }
    return asset;
}

export function file_name_of(path: string) {
    return path.split(/[/\\]/).pop() || "";
}

export function file_stem_of(path: string) {
    return file_name_of(path).replace(/\.[^.]+$/, "");
}

/** Uploads a file made in the app, e.g. a monster's picture, and returns its asset name */
export async function upload_bytes(
    bytes: Uint8Array | Blob,
    file_name: string,
): Promise<string | null> {
    uploadState.uploading = true;
    try {
        return await upload_content(bytes, file_name);
    } finally {
        uploadState.uploading = false;
    }
}

/** Uploads a local file and returns its asset name, or null if it failed. */
export async function upload_path(path: string): Promise<string | null> {
    const file_name = file_name_of(path);
    if (!file_name) {
        notify("Ungültiger Dateiname", MessageTypes.Error, 3000);
        return null;
    }

    uploadState.uploading = true;
    try {
        return await upload_file(path, file_name);
    } finally {
        uploadState.uploading = false;
    }
}

const AUDIO_EXTENSIONS = ["mp3", "ogg", "opus", "wav", "m4a", "flac"];

/** The browser's file picker, there are no paths there */
function choose_file(accept: string): Promise<File | null> {
    return choose_files(accept, false).then((files) => files[0] ?? null);
}

/**
 * The browser's file picker for one or more files, none if canceled. It works in the
 * desktop app too, and its files are read straight from the disk.
 */
export function choose_files(accept: string, multiple = true): Promise<File[]> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = multiple;
        input.addEventListener("change", () => resolve([...(input.files ?? [])]));
        input.addEventListener("cancel", () => resolve([]));
        input.click();
    });
}

/**
 * Lets the user pick an image or video, or an audio file, null if they canceled. A path
 * in the desktop app, a File in a browser.
 */
export async function pick_file(
    kind: "visual" | "audio" = "visual",
): Promise<string | File | null> {
    if (!in_tauri) {
        return choose_file(kind === "audio" ? "audio/*" : "image/*,video/*");
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    if (kind === "audio") {
        return await open({
            multiple: false,
            filters: [
                { name: "Audio", extensions: AUDIO_EXTENSIONS },
                { name: "Alle Dateien", extensions: ["*"] },
            ],
        });
    }
    return await open({
        multiple: false,
        filters: [
            {
                name: "Bilder & Videos",
                extensions: [
                    "png",
                    "jpg",
                    "jpeg",
                    "webp",
                    "gif",
                    "bmp",
                    "avif",
                    "mp4",
                    "webm",
                    "mov",
                    "mkv",
                ],
            },
            { name: "Alle Dateien", extensions: ["*"] },
        ],
    });
}

/** Lets the user pick a text file, e.g. an exported map, and reads it. Null if canceled. */
export async function pick_text(
    kind: string,
    extensions: string[],
): Promise<{ text: string; file_name: string } | null> {
    if (!in_tauri) {
        const file = await choose_file(extensions.map((extension) => `.${extension}`).join(","));
        return file ? { text: await file.text(), file_name: file.name } : null;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
        multiple: false,
        filters: [
            { name: kind, extensions },
            { name: "Alle Dateien", extensions: ["*"] },
        ],
    });
    if (!path) return null;
    const { readFile } = await import("@tauri-apps/plugin-fs");
    return {
        text: new TextDecoder().decode(await readFile(path)),
        file_name: file_name_of(path),
    };
}

/** Uploads a picked file, its path in the desktop app or the File in a browser */
export async function upload_picked(picked: string | File): Promise<string | null> {
    if (typeof picked === "string") return await upload_path(picked);
    return await upload_bytes(picked, picked.name);
}

/** Uploads the file at path, or one the user picks without a path. Null if canceled or failed. */
export async function upload(path?: string): Promise<string | null> {
    const selected = path ?? (await pick_file());
    // User canceled the selection
    if (selected === null) return null;
    return await upload_picked(selected);
}
