// Monsters from Open5e, an open database of 5e content: https://open5e.com
const API = "https://api.open5e.com/v2/creatures/";
const ABILITIES = [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
] as const;

export type Ability = (typeof ABILITIES)[number];

export const ABILITY_SHORT: Record<Ability, string> = {
    strength: "STÄ",
    dexterity: "GES",
    constitution: "KON",
    intelligence: "INT",
    wisdom: "WEI",
    charisma: "CHA",
};

export type MonsterFeature = { name: string; desc: string };

export type Monster = {
    key: string;
    name: string;
    size: { name: string; key: string };
    type: { name: string; key: string };
    alignment?: string;
    armor_class: number;
    armor_detail?: string;
    hit_points: number;
    hit_dice?: string;
    speed?: Record<string, number | string | boolean | null>;
    ability_scores: Record<Ability, number>;
    modifiers: Record<Ability, number>;
    initiative_bonus?: number;
    challenge_rating?: number;
    challenge_rating_text?: string | null;
    languages?: { as_string?: string } | null;
    traits?: MonsterFeature[];
    actions?: (MonsterFeature & { action_type?: string })[];
    document?: { key: string; display_name?: string; name: string };
};

/** What markers keep of a monster, the full stat block is loaded when needed */
export type MonsterInfo = {
    key: string;
    armor_class: number;
    initiative_bonus: number;
    challenge_rating: string;
    type: string;
};

/** Marker size in grid cells for a creature size */
export const SIZE_CELLS: Record<string, number> = {
    tiny: 1,
    small: 1,
    medium: 1,
    large: 2,
    huge: 3,
    gargantuan: 4,
};

/** e.g. 0.25 becomes "1/4" */
export function challenge_rating(monster: Monster) {
    if (monster.challenge_rating_text) return monster.challenge_rating_text;
    const rating = monster.challenge_rating ?? 0;
    const fractions: Record<number, string> = {
        0.125: "1/8",
        0.25: "1/4",
        0.5: "1/2",
    };
    return fractions[rating] ?? String(rating);
}

export function monster_info(monster: Monster): MonsterInfo {
    return {
        key: monster.key,
        armor_class: monster.armor_class,
        initiative_bonus:
            monster.initiative_bonus ?? monster.modifiers?.dexterity ?? 0,
        challenge_rating: challenge_rating(monster),
        type: monster.type?.name ?? "",
    };
}

export function modifier_string(modifier: number) {
    return modifier >= 0 ? `+${modifier}` : `−${Math.abs(modifier)}`;
}

export { ABILITIES };

/** Searches the 5e monsters by name, those of the SRD first */
export async function search_monsters(query: string): Promise<Monster[]> {
    const params = new URLSearchParams({
        name__icontains: query,
        document__gamesystem__key: "5e-2014",
        limit: "40",
    });
    const response = await fetch(`${API}?${params}`);
    if (!response.ok) throw new Error(`Open5e answered ${response.status}`);
    const results: Monster[] = (await response.json()).results ?? [];
    for (const monster of results) cache.set(monster.key, monster);
    const lower = query.toLowerCase();
    // Exact names first, then the official SRD, then the rest by name
    return results.toSorted(
        (a, b) =>
            Number(b.name.toLowerCase() === lower) -
                Number(a.name.toLowerCase() === lower) ||
            Number(b.document?.key === "srd-2014") -
                Number(a.document?.key === "srd-2014") ||
            a.name.localeCompare(b.name),
    );
}

const cache = new Map<string, Monster>();

export async function get_monster(key: string): Promise<Monster> {
    const cached = cache.get(key);
    if (cached) return cached;
    const response = await fetch(`${API}${encodeURIComponent(key)}/`);
    if (!response.ok) throw new Error(`Open5e answered ${response.status}`);
    const monster: Monster = await response.json();
    cache.set(key, monster);
    return monster;
}

/** A d20 for initiative, without the 3D dice */
export function roll_initiative(bonus: number) {
    const roll = Math.floor(Math.random() * 20) + 1;
    return { roll, total: roll + bonus };
}
