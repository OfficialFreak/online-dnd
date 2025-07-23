<script lang="ts">
    let { stat, character } = $props();

    let color = $derived(
        character.decorations.themeColor?.themeColor || "black",
    );
    let stat_name = $derived(Object.keys(character.passiveSenses)[stat]);
    let stat_value = $derived(Object.values(character.passiveSenses)[stat]);
</script>

<div class="w-full overflow-hidden px-1">
    <div
        class="border rounded-md flex flex-row items-center gap-4 p-1 px-2 frosted dark-frosted"
        style="border-color: {color}"
    >
        <span
            class="border rounded-full px-3 text-lg"
            style="border-color: {color}">{stat_value}</span
        >
        <span class="text-xs uppercase block text-base-content/80"
            >passive {stat_name}</span
        >
    </div>
</div>
