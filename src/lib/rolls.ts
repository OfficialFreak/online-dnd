import type { AnyRoll } from "./types/messaging/server_messages";

export type RollMode = "normal" | "advantage" | "disadvantage";

/** A roll in the history. Private rolls never left this client. */
export type RollEntry = AnyRoll & { private?: boolean };

/** What the dice roller rolled. d20s are both d20s of a roll with advantage or disadvantage. */
export type RollOutcome = {
    dice_values: string;
    roll_result: number;
    single_roll: boolean;
    mode: RollMode;
    d20s: number[];
};

const STAT_LABELS: Record<string, string> = {
    strength: "Stärke",
    dexterity: "Geschicklichkeit",
    constitution: "Konstitution",
    intelligence: "Intelligenz",
    wisdom: "Weisheit",
    charisma: "Charisma",
    initiative: "Initiative",
};

export function stat_label(stat: string) {
    return STAT_LABELS[stat] ?? stat[0].toUpperCase() + stat.substring(1);
}

export function mode_label(mode?: RollMode | null) {
    if (mode === "advantage") return "Vorteil";
    if (mode === "disadvantage") return "Nachteil";
    return "";
}

/** e.g. " · Vorteil (17 | 4)", empty for a normal roll */
export function mode_suffix(mode?: RollMode | null, d20s?: number[] | null) {
    const label = mode_label(mode);
    if (!label) return "";
    return ` · ${label}${d20s?.length === 2 ? ` (${d20s[0]} | ${d20s[1]})` : ""}`;
}

/** Which of the two d20s counts */
export function kept_d20_index(mode: RollMode | null | undefined, d20s: number[]) {
    if (mode === "advantage") return d20s[0] >= d20s[1] ? 0 : 1;
    return d20s[0] <= d20s[1] ? 0 : 1;
}

/** e.g. " + 3 = 20" for a roll of 17 with a bonus of 3 */
export function bonus_string(result: number, bonus: number) {
    if (bonus === 0) return "";
    return bonus > 0
        ? ` + ${bonus} = ${result + bonus}`
        : ` - ${bonus * -1} = ${result + bonus}`;
}
