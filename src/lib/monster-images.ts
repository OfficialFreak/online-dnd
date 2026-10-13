// Pictures for markers to choose from. The 5e API has one for every monster of the SRD,
// every creature type has a token with its symbol, and Openverse has free pictures.
import { CREATURE_ICONS } from "./creature-icons";

const API = "https://www.dnd5eapi.co";

/** An image file for a marker */
export type Picture = { bytes: Uint8Array; file_name: string };

/** Names compare without case and punctuation, Open5e and the 5e API write them alike */
function comparable(name: string) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/** The 5e API's monsters by their comparable name */
let api_monsters: Promise<Map<string, string>> | null = null;

function load_api_monsters() {
    api_monsters ??= fetch(`${API}/api/2014/monsters`)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`The 5e API answered ${response.status}`);
            }
            return response.json();
        })
        .then(
            (list: { results: { index: string; name: string }[] }) =>
                new Map(
                    list.results.map((monster) => [
                        comparable(monster.name),
                        monster.index,
                    ]),
                ),
        )
        .catch((e) => {
            // Tried again for the next monster
            api_monsters = null;
            throw e;
        });
    return api_monsters;
}

const TOKEN_SIZE = 512;

/** A token with the symbol of the creature type, e.g. "Fiend (Demon)" */
export async function type_token(type: string): Promise<Picture> {
    const lower = type.toLowerCase();
    const key =
        Object.keys(CREATURE_ICONS).find((key) => lower.includes(key)) ??
        "creature";
    const { path, color } = CREATURE_ICONS[key];

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TOKEN_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas to draw the token on");

    context.fillStyle = color;
    context.fillRect(0, 0, TOKEN_SIZE, TOKEN_SIZE);
    // Lighter in the middle, darker at the edges
    const shade = context.createRadialGradient(
        TOKEN_SIZE / 2,
        TOKEN_SIZE * 0.42,
        TOKEN_SIZE * 0.1,
        TOKEN_SIZE / 2,
        TOKEN_SIZE / 2,
        TOKEN_SIZE * 0.75,
    );
    shade.addColorStop(0, "rgba(255, 255, 255, 0.2)");
    shade.addColorStop(1, "rgba(0, 0, 0, 0.5)");
    context.fillStyle = shade;
    context.fillRect(0, 0, TOKEN_SIZE, TOKEN_SIZE);

    // The symbol fills the middle, which the hexagon of a marker shows
    const scale = 0.6;
    const margin = (TOKEN_SIZE * (1 - scale)) / 2;
    context.translate(margin, margin);
    context.scale((TOKEN_SIZE * scale) / 512, (TOKEN_SIZE * scale) / 512);
    context.shadowColor = "rgba(0, 0, 0, 0.6)";
    context.shadowBlur = 16;
    context.fillStyle = "#f8fafc";
    context.fill(new Path2D(path));

    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Drawing the token failed");
    return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        file_name: `creature-${key}.png`,
    };
}

/** A picture the DM may choose for a marker, shown small until chosen */
export type Suggestion = {
    id: string;
    /** Shown in the choice, a small version or the picture itself */
    preview: string;
    label: string;
    /** The picture to upload, fetched once chosen */
    picture: () => Promise<Picture>;
};

/** Fetches a picture of another server, which allows reading it */
async function fetched(url: string, file_name: string): Promise<Picture> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), file_name };
}

type OpenverseImage = { id: string; title?: string; creator?: string; thumbnail?: string };

/** Freely licensed pictures from Openverse, mostly photos and drawings from Flickr */
async function openverse(query: string, count: number): Promise<OpenverseImage[]> {
    const response = await fetch(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${count}&mature=false`,
    );
    if (!response.ok) throw new Error(`Openverse answered ${response.status}`);
    return (await response.json()).results ?? [];
}

/** The 5e API's picture of the monster and the symbol of its creature type, quick to get */
export async function quick_suggestions(
    name: string,
    type: string | null,
): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const index = await load_api_monsters()
        .then((monsters) => monsters.get(comparable(name)) ?? null)
        .catch(() => null);
    if (index) {
        const url = `${API}/api/images/monsters/${index}.png`;
        suggestions.push({
            id: `api-${index}`,
            preview: url,
            label: "Bild aus dem Monsterhandbuch (5e-API)",
            picture: () => fetched(url, `monster-${index}.png`),
        });
    }
    if (type) {
        const token = await type_token(type).catch(() => null);
        if (token) {
            suggestions.push({
                id: `type-${token.file_name}`,
                preview: URL.createObjectURL(
                    new Blob([token.bytes as BlobPart], { type: "image/png" }),
                ),
                label: `Symbol der Kreaturart (${type})`,
                picture: async () => token,
            });
        }
    }
    return suggestions;
}

/**
 * Free pictures from Openverse, which takes a few seconds. Mostly painted miniatures and
 * players' drawings: "dnd" and "miniature" keep out goblin sharks, planes and premieres of
 * fantasy films. The name alone only when those find little.
 */
export async function openverse_suggestions(name: string): Promise<Suggestion[]> {
    const search = (query: string) =>
        openverse(query, 8).catch((e) => {
            console.warn("Searching Openverse failed", e);
            return [] as OpenverseImage[];
        });
    let found = (await Promise.all([search(`${name} dnd`), search(`${name} miniature`)])).flat();
    if (found.length < 4) found = [...found, ...(await search(name))];
    const seen = new Set<string>();
    const suggestions: Suggestion[] = [];
    for (const image of found) {
        if (!image.thumbnail || seen.has(image.id)) continue;
        seen.add(image.id);
        suggestions.push({
            id: `openverse-${image.id}`,
            preview: image.thumbnail,
            // Titles of photos can be whole stories
            label:
                [image.title?.slice(0, 60), image.creator].filter(Boolean).join(" · ") ||
                "Openverse",
            picture: () => fetched(image.thumbnail!, `openverse-${image.id}.jpg`),
        });
    }
    return suggestions.slice(0, 12);
}
