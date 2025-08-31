<script lang="ts">
    import { CheckResult } from "$lib/types/messaging/client_messages";
    import { appState, roller } from "../../state.svelte";

    let { stat, character } = $props();

    let color = $derived(
        character.decorations.themeColor?.themeColor || "black",
    );
    let stat_name = $derived(Object.keys(character.actualStats)[stat]);
    let modifier: number = $derived(
        Object.values(character.statModifiers)[stat] as number,
    );
    let stat_value = $derived(Object.values(character.actualStats)[stat]);

    async function roll_check() {
        if (!roller.value || !appState.ws) return;
        let tmp_modifier = modifier;
        let tmp_name = stat_name;
        let result = await roller.value(["1d20"], tmp_modifier);
        await appState.ws.send(
            CheckResult.create(tmp_name, result.roll_result, tmp_modifier),
        );
    }
</script>

<div class="w-full basis-1/3 overflow-hidden px-4">
    <div
        class="border rounded-box flex flex-col justify-center items-center gap-1.5 p-1 px-2 frosted dark-frosted"
        style="border-color: {color}"
    >
        <span class="text-xs uppercase block text-base-content/80"
            >{stat_name}</span
        >
        <button
            class="btn btn-outline btn-sm text-xl"
            style="border-color: {color}"
            onclick={roll_check}>{modifier > 0 ? "+" : ""}{modifier}</button
        >
        <span
            class="border rounded-full px-3 text-lg"
            style="border-color: {color}">{stat_value}</span
        >
    </div>
</div>
