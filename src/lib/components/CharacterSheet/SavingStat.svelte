<script lang="ts">
    import { SaveResult } from "$lib/types/messaging/client_messages";
    import { appState, roller } from "../../../routes/state.svelte";

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
        let result = await roller.value(["1d20"], modifier);
        // TODO: Saving Throws
        await appState.ws.send(
            SaveResult.create(stat_name, result.roll_result, modifier),
        );
    }
</script>

<div class="w-full basis-1/2 overflow-hidden px-1">
    <div
        class="border rounded-box flex flex-row justify-between items-center gap-1.5 p-1 px-2 frosted dark-frosted"
        style="border-color: {color}"
    >
        <span class="text-xs uppercase block text-gray-200">{stat_name}</span>
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
