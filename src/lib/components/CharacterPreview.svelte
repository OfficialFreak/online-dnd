<script lang="ts">
    let { character } = $props();
    let base_stats = {
        "strength": character.stats[0].value,
        "dexterity": character.stats[1].value,
        "constitution": character.stats[2].value,
        "intelligence": character.stats[3].value,
        "wisdom": character.stats[4].value,
        "charisma": character.stats[5].value,
    };
    let modifiers = {
        "strength": Math.floor((base_stats.strength - 10) / 2),
        "dexterity": Math.floor((base_stats.dexterity - 10) / 2),
        "constitution": Math.floor((base_stats.constitution - 10) / 2),
        "intelligence": Math.floor((base_stats.intelligence - 10) / 2),
        "wisdom": Math.floor((base_stats.wisdom - 10) / 2),
        "charisma": Math.floor((base_stats.charisma - 10) / 2),
    };
    let max_health = $derived(character.baseHitPoints + character.temporaryHitPoints + modifiers.constitution);
    let current_health = $derived(max_health - character.removedHitPoints);
</script>

<div class="relative grow border border-base-200 rounded-[4px] flex flex-col">
    <div class="absolute inset-0 -z-1 bg-cover brightness-30 pointer-events-none rounded-[4px]" style="background-image: url('{character.decorations.backdropAvatarUrl}')"></div>
    <div class="p-1 flex flex-row gap-2">
        <div class="h-22 aspect-square p-1 mask mask-hexagon" style="background: {character.decorations.themeColor.themeColor}">
            <img src={character.decorations.avatarUrl} alt="Character" class="mask mask-hexagon h-20 aspect-square" />
        </div>
        <div class="flex flex-col h-full w-full justify-center">
            <span class="text-lg font-bold">{character.name}</span>
            <span class="text-gray-400 w-full">{character.gender} {character.race.fullName} {character.classes.map((c_class: any) => `${c_class.definition.name} ${c_class.level}`).join(', ')}</span>
            <span>Level {character.classes.reduce((acc: any, c_class: any) => acc + c_class.level, 0)}</span>
        </div>
    </div>
    <div class="tooltip tooltip-bottom -my-[5px]" data-tip={`${current_health} / ${max_health}`}>
        <progress class="progress progress-error w-full" value={current_health} max={max_health}></progress>
    </div>
</div>