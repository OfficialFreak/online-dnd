import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { fetch } from "@tauri-apps/plugin-http";
import { fileTypeFromBuffer } from "file-type";
import { appState } from "./state.svelte";
import { MessageTypes, notify } from "./notifications.svelte";

// Keep in sync with MAX_UPLOAD_SIZE in dnd-online-server/src/constants.rs
const MAX_UPLOAD_MB = 50;

export const uploadState = $state({ uploading: false });

/** Uploads a file and returns the asset name it is stored under, or null if the upload failed. */
async function upload_file(
    selectedFilePath: string,
    selectedFileName: string,
): Promise<string | null> {
    if (!appState.token) {
        notify(
            "Hochladen fehlgeschlagen: Du bist nicht angemeldet.",
            MessageTypes.Error,
            5000,
        );
        return null;
    }

    // Read the file as binary
    let fileContent: Uint8Array;
    try {
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

    // Fail fast: the upload would be rejected anyway, and huge files are slow to hand over to Tauri
    if (fileContent.byteLength > MAX_UPLOAD_MB * 1_000_000) {
        notify(
            `Die Datei ist zu groß (maximal ${MAX_UPLOAD_MB} MB).`,
            MessageTypes.Error,
            8000,
        );
        return null;
    }

    const fileType = await fileTypeFromBuffer(fileContent);

    if (fileType && fileType.mime.startsWith("video/")) {
        notify(
            "Die Datei wird auf dem Server konvertiert, weshalb der Upload einige Minuten dauern kann.",
            MessageTypes.Info,
            5000,
        );
    }

    // Create form data using Tauri's HTTP client
    const formData = new FormData();
    const blob = new Blob([fileContent]);
    formData.append("file", blob, selectedFileName);

    // Make the request using Tauri's fetch
    let response: Response;
    try {
        response = await fetch(
            `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets?key=${encodeURIComponent(appState.token)}`,
            {
                method: "POST",
                body: formData,
            },
        );
    } catch (e) {
        console.error("Upload request failed", e);
        notify(
            "Hochladen fehlgeschlagen: Der Server ist nicht erreichbar.",
            MessageTypes.Error,
            8000,
        );
        return null;
    }

    if (!response.ok) {
        // The server answers with a message meant for the user
        const reason = await response.text().catch(() => "");
        console.error(
            `Upload failed: ${response.status} ${response.statusText}`,
            reason,
        );
        notify(
            reason
                ? `Hochladen fehlgeschlagen: ${reason}`
                : `Hochladen fehlgeschlagen (Fehler ${response.status}).`,
            MessageTypes.Error,
            8000,
        );
        return null;
    }

    const asset = await response.text().catch(() => "");
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

/** Lets the user pick an image or video, or an audio file, null if they canceled */
export async function pick_file(kind: "visual" | "audio" = "visual") {
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

/** Uploads the file at path, or one the user picks without a path. Null if canceled or failed. */
export async function upload(path?: string): Promise<string | null> {
    const selected = path ?? (await pick_file());
    // User canceled the selection
    if (selected === null) return null;
    return await upload_path(selected);
}
