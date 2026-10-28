<script lang="ts">
    import { CheckResult } from "$lib/types/messaging/client_messages";
    import {
        SKILLS,
        type Character,
        type ProficiencyLevel,
        type Skill,
    } from "$lib/types/character";
    import { appState, roller } from "../../state.svelte";
    import { SKILL_LABELS, shared_roll } from "$lib/rolls";

    let { skill, character }: { skill: Skill; character: Character } = $props();

    const ABBREVIATIONS = {
        strength: "STÄ",
        dexterity: "GES",
        constitution: "KON",
        intelligence: "INT",
        wisdom: "WEI",
        charisma: "CHA",
    };

    const PROFICIENCY: Record<ProficiencyLevel, string> = {
        0: "Nicht geübt",
        0.5: "Halber Übungsbonus",
        1: "Geübt",
        2: "Expertise",
    };

    let color = $derived(character.themeColor);
    let modifier = $derived(character.skillModifier(skill));
    let level = $derived(character.skillProficiencyLevel(skill));
    // Filled when proficient, half with Jack of All Trades, ringed with expertise
    let marker_fill = $derived(
        level >= 1
            ? color
            : level
              ? `linear-gradient(90deg, ${color} 50%, transparent 50%)`
              : "transparent",
    );

    async function roll_check() {
        if (!roller.value || !appState.ws) return;
        let tmp_skill = skill;
        let tmp_modifier = modifier;
        let result = await roller.value(["1d20"], tmp_modifier);
        await appState.ws.send(
            CheckResult.create(
                tmp_skill,
                result.roll_result,
                tmp_modifier,
                result.mode,
                result.d20s,
                shared_roll(result),
            ),
        );
    }
</script>

<div
    class="border rounded-box flex flex-row items-center gap-1 py-0.5 pl-1.5 pr-0.5 min-w-0 frosted dark-frosted"
    style="border-color: {color}"
>
    <span
        class="size-2 shrink-0 rounded-full border"
        style="border-color: {color}; background: {marker_fill}; {level === 2
            ? `outline: 1px solid ${color}; outline-offset: 1px`
            : ''}"
        role="img"
        aria-label={PROFICIENCY[level]}
        title={PROFICIENCY[level]}
    ></span>
    <span class="w-5.5 shrink-0 text-[0.625rem] font-bold text-base-content/50"
        >{ABBREVIATIONS[SKILLS[skill]]}</span
    >
    <span
        class="grow min-w-0 text-xs leading-tight hyphens-auto wrap-anywhere text-base-content/80"
        >{SKILL_LABELS[skill]}</span
    >
    <button
        class="btn btn-outline btn-xs min-w-8 shrink-0 px-1 text-sm"
        style="border-color: {color}"
        onclick={roll_check}>{modifier > 0 ? "+" : ""}{modifier}</button
    >
</div>
