// Free sounds the DM can search and add: the ambience of Tabletop Audio, made for
// tabletop games, and effects from Freesound and music from Jamendo through Openverse.
import type { Sound } from "./audio.svelte";

export type LibrarySource = "ambience" | "effects" | "music";

/** A sound in one of the libraries */
export type LibrarySound = {
    title: string;
    /** A line about it, e.g. its length and who made it */
    detail: string;
    url: string;
    kind: Sound["kind"];
};

/** A track of Tabletop Audio, as the server sends them */
export type TabletopTrack = {
    title: string;
    type: string;
    genres: string[];
    tags: string[];
    flavor: string;
    link: string;
};

/** The libraries are English, so common German words are looked up too */
const ENGLISH: Record<string, string> = {
    taverne: "tavern",
    kneipe: "tavern",
    gasthaus: "inn",
    höhle: "cave",
    wald: "forest",
    sturm: "storm",
    gewitter: "thunderstorm",
    donner: "thunder",
    blitz: "lightning",
    regen: "rain",
    wind: "wind",
    kampf: "battle",
    schlacht: "battle",
    feuer: "fire",
    lagerfeuer: "campfire",
    schwert: "sword",
    bogen: "bow",
    pfeil: "arrow",
    tür: "door",
    drache: "dragon",
    stadt: "city",
    dorf: "village",
    markt: "market",
    burg: "castle",
    schloss: "castle",
    tempel: "temple",
    kirche: "church",
    friedhof: "graveyard",
    gruft: "crypt",
    kerker: "dungeon",
    sumpf: "swamp",
    wüste: "desert",
    berg: "mountain",
    schnee: "snow",
    eis: "ice",
    meer: "ocean",
    see: "lake",
    fluss: "river",
    wasser: "water",
    schiff: "ship",
    hafen: "harbor",
    nacht: "night",
    geist: "ghost",
    magie: "magic",
    zauber: "spell",
    explosion: "explosion",
    schritte: "footsteps",
    glocke: "bell",
    schmiede: "forge",
    pferd: "horse",
    wolf: "wolf",
    monster: "monster",
    gruselig: "creepy",
    unheimlich: "eerie",
    ruhig: "calm",
    episch: "epic",
    traurig: "sad",
    fröhlich: "happy",
    mittelalter: "medieval",
};

/** Each word of the query, with its English one if there is one */
function words_of(query: string) {
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => [word, ENGLISH[word]].filter(Boolean) as string[]);
}

/** The query with German words put into English, for the searches of Openverse */
function in_english(query: string) {
    return words_of(query)
        .map((options) => options[options.length - 1])
        .join(" ");
}

/** Sounds shorter than this play once, longer ones are ambience and loop */
const EFFECT_SECONDS = 60;

const OPENVERSE = "https://api.openverse.org/v1/audio/";

/** File names like "door_creak_02.wav" become "door creak 02" */
function clean_title(title: string) {
    const text = new DOMParser().parseFromString(title, "text/html")
        .documentElement.textContent;
    return (text ?? title)
        .replace(/\.(wav|mp3|ogg|flac|aiff?|m4a)$/i, "")
        .replace(/_+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
}

function length_of(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Effects from Freesound or music from Jamendo */
export async function search_openverse(
    query: string,
    source: Exclude<LibrarySource, "ambience">,
): Promise<LibrarySound[]> {
    const params = new URLSearchParams({
        q: in_english(query),
        source: source === "effects" ? "freesound" : "jamendo",
        // More needs an API key
        page_size: "20",
    });
    const response = await fetch(`${OPENVERSE}?${params}`);
    if (!response.ok) throw new Error(`Openverse answered ${response.status}`);
    const results: {
        title: string;
        url: string | null;
        duration: number | null;
        creator: string | null;
    }[] = (await response.json()).results ?? [];
    return results
        .filter((result) => result.url)
        .map((result) => {
            const seconds = result.duration ? result.duration / 1000 : null;
            return {
                title: clean_title(result.title),
                detail: [seconds ? length_of(seconds) : "", result.creator ?? ""]
                    .filter(Boolean)
                    .join(" · "),
                url: result.url!,
                // A long recording of rain or a crowd plays alongside the music
                kind:
                    source === "music"
                        ? "music"
                        : (seconds ?? 0) >= EFFECT_SECONDS
                          ? "ambience"
                          : "effect",
            };
        });
}

/** Tracks whose title, tags or description have every word, the newest first */
export function search_tabletop(
    tracks: TabletopTrack[],
    query: string,
): LibrarySound[] {
    const words = words_of(query);
    return tracks
        .filter((track) => {
            const text = [
                track.title,
                track.flavor,
                track.type,
                ...(track.tags ?? []),
                ...(track.genres ?? []),
            ]
                .join(" ")
                .toLowerCase();
            return words.every((options) =>
                options.some((word) => text.includes(word)),
            );
        })
        .slice(0, 60)
        .map((track) => ({
            title: clean_title(track.title),
            detail: track.flavor,
            url: track.link,
            // "ambience + music", "music + minimal ambience", ...: what comes first
            kind: track.type?.trim().toLowerCase().startsWith("music")
                ? "music"
                : "ambience",
        }));
}
