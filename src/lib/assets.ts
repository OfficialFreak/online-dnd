export type AssetKind = "image" | "video" | "audio" | "other";

/** An uploaded file on the server */
export type AssetInfo = {
    name: string;
    size: number;
    /** Milliseconds since 1970 */
    modified?: number | null;
    /** A scene, marker or sound uses it, so it can't be deleted */
    used: boolean;
};

const KINDS: Record<string, AssetKind> = {
    webp: "image",
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    avif: "image",
    bmp: "image",
    mp4: "video",
    webm: "video",
    mov: "video",
    mp3: "audio",
    ogg: "audio",
    oga: "audio",
    opus: "audio",
    wav: "audio",
    m4a: "audio",
    flac: "audio",
};

export function asset_kind(name: string): AssetKind {
    return KINDS[name.split(".").pop()?.toLowerCase() ?? ""] ?? "other";
}

/** "Goblin_compressed.webp" becomes "Goblin" */
export function asset_title(name: string) {
    return name.replace(/_compressed(?=\.[^.]+$)/, "").replace(/\.[^.]+$/, "");
}
