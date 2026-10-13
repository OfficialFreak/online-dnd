// Pictures for markers to choose from, all made by people: the 5e API has one for every
// monster of the SRD, Battle for Wesnoth painted portraits of many creatures, Wikimedia
// Commons has old illustrations, and every creature type has a token with its symbol.
import { CREATURE_ICONS } from "./creature-icons";
import { WESNOTH_COMMIT, WESNOTH_PORTRAITS } from "./wesnoth-portraits";

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

/**
 * The 5e API's picture of the monster, painted portraits of Battle for Wesnoth and the
 * symbol of its creature type, quick to get
 */
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
    suggestions.push(...wesnoth_suggestions(name, type));
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

/** A word without its plural, "wolves" and "goblins" as "wolf" and "goblin" */
function singular(word: string) {
    if (word.endsWith("ves")) return word.slice(0, -3) + "f";
    if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) return word.slice(0, -1);
    return word;
}

/** D&D's names for what Wesnoth paints under another one */
const SYNONYMS: Record<string, string[]> = {
    zombie: ["walking-corpse", "soulless"],
    skeleton: ["skeletal", "bone"],
    ghost: ["spectre", "shadow", "wraith"],
    specter: ["spectre"],
    ghast: ["ghoul"],
    wight: ["draug", "revenant", "death-knight"],
    mummy: ["revenant"],
    vampire: ["nightgaunt"],
    worg: ["wolf"],
    dragon: ["fire-dragon", "drake", "wyvern"],
    wyrmling: ["drake"],
    giant: ["ogre", "troll", "yeti"],
    owlbear: ["bear"],
    griffon: ["gryphon"],
    lizardfolk: ["saurian"],
    kobold: ["saurian"],
    treant: ["wose"],
    hobgoblin: ["orc"],
    bugbear: ["orc"],
    merrow: ["merfolk"],
    sahuagin: ["merfolk", "naga"],
    drow: ["elves"],
    duergar: ["dwarves"],
    snake: ["serpent"],
    panther: ["cat"],
    lion: ["cat"],
    tiger: ["cat"],
    hawk: ["falcon"],
    eagle: ["falcon"],
    warhorse: ["horse"],
    djinni: ["jinn"],
    efreeti: ["jinn"],
    elemental: ["fire_guardian", "jinn", "fire_wraith"],
    cultist: ["dark-adept", "necromancer"],
    wizard: ["mage"],
    priest: ["mage-white"],
    acolyte: ["mage-white"],
    thug: ["ruffian"],
    spy: ["thief", "footpad"],
    veteran: ["swordsman", "sergeant"],
    noble: ["lord", "lady", "general"],
    commoner: ["peasant"],
    gladiator: ["duelist", "swordsman"],
    bandit: ["outlaw", "thug", "footpad", "ruffian"],
};

/**
 * Words that only describe: a red dragon is no red mage, a giant spider no giant rat. Left
 * out unless nothing else is in the name.
 */
const DESCRIBING = new Set([
    "adult", "young", "ancient", "elder", "baby", "dire", "giant", "greater", "lesser",
    "swarm", "of", "the", "and", "red", "blue", "black", "white", "green", "brass",
    "bronze", "copper", "gold", "silver", "brown", "gray", "grey", "boss", "chief",
]);

/** Without a name that fits, the creature type tells where to look */
const BY_TYPE: [RegExp, string[]][] = [
    [/goblinoid/, ["goblins/"]],
    [/\borc\b/, ["orcs/"]],
    [/\belf\b/, ["elves/"]],
    [/dwarf/, ["dwarves/"]],
    [/lizardfolk/, ["saurians/"]],
    [/merfolk/, ["merfolk/"]],
    [/undead/, ["undead/"]],
    [/dragon/, ["monsters/fire-dragon", "drakes/", "monsters/wyvern"]],
    [/giant/, ["monsters/ogre", "trolls/", "monsters/yeti"]],
    [/beast/, ["monsters/bear", "wolves/", "monsters/woodland_boar", "monsters/giant-rat"]],
    [/monstrosity/, ["monsters/"]],
    [/fiend/, ["humans/dark-adept", "humans/necromancer", "monsters/fire_wraith"]],
    [/elemental/, ["monsters/fire_guardian", "monsters/jinn", "monsters/fire_wraith"]],
    [/plant/, ["woses/"]],
    [/fey/, ["elves/sylph", "elves/shyde", "elves/sorceress"]],
    [/aberration/, ["monsters/deep-tentacle", "monsters/kraken"]],
    [/celestial/, ["humans/mage-white", "humans/mage-light"]],
    [/humanoid/, ["humans/"]],
];

/** Undead only for the undead: else a goblin got a zombie goblin first */
const UNDEAD_WORDS = /zombie|skelet|lich|ghost|ghoul|ghast|wight|wraith|spect|undead|mummy|vampire|revenant|draug|death|shadow|bone/;

/**
 * Painted portraits of Battle for Wesnoth for a monster, the best fitting first: its name's
 * words, D&D's other names for them, and its creature type when the name finds little
 */
function wesnoth_portraits(name: string, type: string | null): string[] {
    const all = name.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(singular);
    const naming = all.filter((word) => !DESCRIBING.has(word));
    const words = naming.length ? naming : all;
    const undead = UNDEAD_WORDS.test(name.toLowerCase()) || /undead/i.test(type ?? "");
    const scores = new Map<string, number>();
    for (const [folder, files] of Object.entries(WESNOTH_PORTRAITS)) {
        if (folder === "undead" && !undead) continue;
        for (const file of files) {
            const stem = file.replace(/\.(webp|png)$/, "");
            const parts = stem.split(/[-_+]/);
            let score = 0;
            for (const word of words) {
                // The plain one first: a ghost before a ghost rider, wolves before a wolf rider
                if (stem === word) score += 6;
                else if (parts.includes(word)) score += 4;
                if (singular(folder) === word) score += 1;
                for (const other of SYNONYMS[word] ?? []) {
                    if (stem === other) score += 5;
                    else if (parts.includes(other)) score += 3;
                    if (folder === other || singular(folder) === other) score += 1;
                }
            }
            if (score > 0) scores.set(`${folder}/${file}`, score);
        }
    }
    const found = [...scores].sort((a, b) => b[1] - a[1]).map(([path]) => path);
    if (!found.length && type) {
        const lower = type.toLowerCase();
        const places = BY_TYPE.find(([pattern]) => pattern.test(lower))?.[1] ?? [];
        for (const place of places) {
            const [folder, stem] = place.split("/");
            for (const file of WESNOTH_PORTRAITS[folder] ?? []) {
                if (folder === "undead" && !undead) continue;
                if (stem && !file.startsWith(stem)) continue;
                const path = `${folder}/${file}`;
                if (!found.includes(path)) found.push(path);
            }
        }
    }
    return found.slice(0, 8);
}

/** "goblins/spearman-2.webp" as "Spearman" */
function portrait_label(path: string) {
    const stem = path.split("/")[1].replace(/\.(webp|png)$/, "").replace(/-\d+$/, "");
    return stem
        .split(/[-_+]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function wesnoth_suggestions(name: string, type: string | null): Suggestion[] {
    return wesnoth_portraits(name, type).map((path) => {
        const url = `https://raw.githubusercontent.com/wesnoth/wesnoth/${WESNOTH_COMMIT}/data/core/images/portraits/${path}`;
        return {
            id: `wesnoth-${path}`,
            preview: url,
            label: `${portrait_label(path)}, gemalt für Battle for Wesnoth`,
            picture: () => fetched(url, `wesnoth-${path.replace("/", "-")}`),
        };
    });
}

/**
 * Old illustrations and drawings from Wikimedia Commons, free to use: trolls of John
 * Bauer, Blake's red dragon. A few seconds, and not every name finds something fitting.
 */
export async function commons_suggestions(name: string): Promise<Suggestion[]> {
    const query = `${name} illustration filetype:bitmap`;
    const response = await fetch(
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
            "&generator=search&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime" +
            `&iiurlwidth=512&gsrsearch=${encodeURIComponent(query)}`,
    );
    if (!response.ok) throw new Error(`Commons answered ${response.status}`);
    const pages: {
        pageid: number;
        index?: number;
        title: string;
        imageinfo?: { thumburl?: string; mime?: string }[];
    }[] = Object.values((await response.json()).query?.pages ?? {});
    return pages
        .toSorted((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .flatMap((page) => {
            const info = page.imageinfo?.[0];
            if (!info?.thumburl) return [];
            // Scanned pages of books come as TIFF, PDF or DjVu, mostly text
            if (/tiff|djvu|pdf/.test(info.mime ?? "")) return [];
            const title = page.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
            return [
                {
                    id: `commons-${page.pageid}`,
                    preview: info.thumburl,
                    label: `${title.slice(0, 60)}, Wikimedia Commons`,
                    picture: () => fetched(info.thumburl!, `commons-${page.pageid}.jpg`),
                },
            ];
        })
        .slice(0, 6);
}
