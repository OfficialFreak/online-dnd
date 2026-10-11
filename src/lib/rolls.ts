import { MessageType, type AnyRoll } from "./types/messaging/server_messages";
import type { DiceReplay } from "./dice-sync";

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
    /** Recognizes the roll when the server sends it back */
    roll_id: string;
    /** How the dice moved, for everyone else to see, null if that isn't possible */
    replay: DiceReplay | null;
};

/** What goes along with a roll so everyone sees the same dice */
export function shared_roll(outcome: RollOutcome) {
    return { roll_id: outcome.roll_id, replay: outcome.replay };
}

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

/** e.g. "Check: Geschicklichkeit" or "2d6 + 1d20" */
export function roll_title(roll: AnyRoll) {
    if (roll.type === MessageType.ROLL_RESULT) {
        return roll.notation || (roll.single_dice ? "Wurf" : "Würfel");
    }
    if (roll.stat === "initiative") return "Initiative";
    return `${roll.type === MessageType.SAVE_RESULT ? "Rettungswurf" : "Check"}: ${stat_label(roll.stat)}`;
}

export function roll_total(roll: AnyRoll) {
    return roll.type === MessageType.ROLL_RESULT
        ? roll.result
        : roll.result + roll.bonus;
}

/** How the total came together, empty if it is a single die */
export function roll_detail(roll: AnyRoll) {
    if (roll.type === MessageType.ROLL_RESULT) {
        return roll.single_dice ? "" : roll.dices;
    }
    if (roll.bonus === 0) return "";
    return `${roll.result} ${roll.bonus > 0 ? "+" : "−"} ${Math.abs(roll.bonus)}`;
}

/** The d20 of a roll of only a d20, to celebrate natural 20s and mourn natural 1s */
export function natural_d20(roll: AnyRoll) {
    if (roll.type !== MessageType.ROLL_RESULT) return roll.result;
    return roll.notation === "1d20" ? roll.result : null;
}

/** Which of the two d20s counts */
export function kept_d20_index(
    mode: RollMode | null | undefined,
    d20s: number[],
) {
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
