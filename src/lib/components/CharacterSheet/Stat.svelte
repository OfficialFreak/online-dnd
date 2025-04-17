<script lang="ts">
    let { stat, color } = $props();

    const stat_map = [
        null,
        "strength",
        "dexterity",
        "constitution",
        "intelligence",
        "wisdom",
        "charisma",
    ]
</script>
<div class="w-full basis-1/3 overflow-hidden px-2">
    <div class="border rounded-box flex flex-col justify-center items-center gap-1.5 p-1 px-2 frosted dark-frosted" style="border-color: {color}">
        <span class="text-xs uppercase block">{stat_map[stat.id]}</span>
        <button class="btn btn-outline btn-sm text-xl" style="border-color: {color}">+3</button>
        <span class="border rounded-full px-3 text-lg" style="border-color: {color}">16</span>
    </div>
</div>