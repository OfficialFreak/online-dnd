<script lang="ts">
    import { SaveResult } from "$lib/types/messaging/client_messages";
    import { appState, roller } from "../../state.svelte";

    let { stat, character } = $props();

    let color = $derived(
        character.decorations.themeColor?.themeColor || "black",
    );
    let stat_name = $derived(Object.keys(character.actualStats)[stat]);
    let modifier: number = $derived(
        Object.values(character.savingModifiers)[stat] as number,
    );

    async function roll_save() {
        if (!roller.value || !appState.ws) return;
        let tmp_name = stat_name;
        let tmp_modifier = modifier;
        let result = await roller.value(["1d20"], tmp_modifier);
        await appState.ws.send(
            SaveResult.create(tmp_name, result.roll_result, tmp_modifier),
        );
    }
</script>

<div class="w-full basis-1/2 overflow-hidden px-1">
    <div
        class="border rounded-box flex flex-row justify-between items-center gap-1.5 p-1 px-2 frosted dark-frosted"
        style="border-color: {color}"
    >
        <span class="text-xs uppercase block text-base-content/80"
            >{stat_name}</span
        >
        <button
            class="btn btn-outline btn-sm text-xl"
            style="border-color: {color}"
            onclick={roll_save}
            >{modifier === 0 ? "" : modifier > 0 ? "+ " : "- "}{Math.abs(
                modifier,
            )}</button
        >
    </div>
</div>
