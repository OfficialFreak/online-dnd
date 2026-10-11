// Pictures for markers made from monsters. The 5e API has one for every monster of the
// SRD, the others get a token with the symbol of their creature type.
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

/** The picture the 5e API has of a monster with this name, null if it has none */
async function api_picture(name: string): Promise<Picture | null> {
    const index = (await load_api_monsters()).get(comparable(name));
    if (!index) return null;
    const response = await fetch(`${API}/api/images/monsters/${index}.png`);
    if (!response.ok) return null;
    return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        file_name: `monster-${index}.png`,
    };
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

/** A picture for a marker made from a monster, its own if the 5e API has one */
export async function monster_picture(
    name: string,
    type: string,
): Promise<Picture> {
    try {
        const picture = await api_picture(name);
        if (picture) return picture;
    } catch (e) {
        console.error("Loading the monster's picture failed", e);
    }
    return type_token(type);
}
