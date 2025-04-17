<script lang="ts">
    let { stat, character } = $props();

    let color = $derived(character.decorations.themeColor.themeColor);
    let stat_name = $derived(Object.keys(character.actualStats)[stat]);
    let modifier: number = $derived(Object.values(character.statModifiers)[stat] as number);
    let stat_value = $derived(Object.values(character.actualStats)[stat]);
</script>
<div class="w-full basis-1/3 overflow-hidden px-4">
    <div class="border rounded-box flex flex-col justify-center items-center gap-1.5 p-1 px-2 frosted dark-frosted" style="border-color: {color}">
        <span class="text-xs uppercase block text-gray-200">{stat_name}</span>
        <button class="btn btn-outline btn-sm text-xl" style="border-color: {color}">{modifier > 0 ? '+' : ''}{modifier}</button>
        <span class="border rounded-full px-3 text-lg" style="border-color: {color}">{stat_value}</span>
    </div>
</div>