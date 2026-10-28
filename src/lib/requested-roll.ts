/**
 * A roll the DM asks this player's app for, made at once with the player's own dice and the
 * bonus from their sheet, as if they had pressed its button. An automated DM asks this way, so
 * the player needn't press anything; the result goes out like any other of their rolls.
 */
import {
    CheckResult,
    RollResult,
    SaveResult,
} from "./types/messaging/client_messages";
import type { RollRequest } from "./types/messaging/server_messages";
import { SKILLS, type Skill } from "./types/character";
import { appState, get_own_character, rollState, roller } from "./state.svelte";
import { shared_roll } from "./rolls";

const ABILITIES = [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
];

export async function roll_requested(request: RollRequest) {
    const character = get_own_character();
    const ws = appState.ws;
    if (!roller.value || !ws) return;
    if (request.mode === "advantage" || request.mode === "disadvantage")
        rollState.mode = request.mode;

    if (request.kind === "dice") {
        const dice = request.dice?.length ? request.dice : ["1d20"];
        const result = await roller.value(dice, 0);
        await ws.send(
            RollResult.create(
                result.dice_values,
                result.roll_result,
                result.single_roll,
                false,
                dice.join(" + "),
                result.mode,
                result.d20s,
                shared_roll(result),
            ),
        );
        return;
    }

    // Checks and saves need the sheet's bonus: without a character there is none to roll with
    const stat = request.stat ?? "";
    if (!character) return;
    let modifier: number | undefined;
    if (request.kind === "save" && ABILITIES.includes(stat)) {
        modifier = (character.savingModifiers as Record<string, number>)[stat];
    } else if (request.kind === "check" && stat === "initiative") {
        modifier = character.actualInitiative;
    } else if (request.kind === "check" && stat in SKILLS) {
        modifier = character.skillModifier(stat as Skill);
    } else if (request.kind === "check" && ABILITIES.includes(stat)) {
        modifier = (character.statModifiers as Record<string, number>)[stat];
    }
    if (modifier === undefined) {
        console.error(
            "The DM asked for a roll the sheet doesn't know",
            request,
        );
        return;
    }
    const result = await roller.value(["1d20"], modifier);
    const create =
        request.kind === "save" ? SaveResult.create : CheckResult.create;
    await ws.send(
        create(
            stat,
            result.roll_result,
            modifier,
            result.mode,
            result.d20s,
            shared_roll(result),
        ),
    );
}
