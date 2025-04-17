<script lang="ts">
    import { gameState } from "../../routes/state.svelte";

    let { character, callback = null } = $props();
</script>

<div class="relative grow border border-base-200 rounded-[4px] flex flex-col">
    <div class="absolute inset-0 -z-1 bg-cover brightness-30 pointer-events-none rounded-[4px]" style="background-image: url('{character.decorations.backdropAvatarUrl}')"></div>
    <div class="p-1 flex flex-row gap-2">
        <div class="h-22 aspect-square p-1 mask mask-hexagon" style="background: {character.decorations.themeColor.themeColor}">
            <img src={character.decorations.avatarUrl} alt="Character" class="mask mask-hexagon h-20 aspect-square" />
        </div>
        <div class="flex flex-col h-full w-full justify-center">
            <span class="text-lg font-bold group">{character.name} <span class="text-gray-400 transition-opacity opacity-0 group-hover:opacity-100">({character.player_name})</span></span>
            <span class="text-gray-400 w-full">{character.detailedDescription}</span>
            <span>Level {character.level}</span>
        </div>
    </div>
    <div class="tooltip tooltip-bottom -my-[5px]" data-tip={`${character.currentHealth} / ${character.maxHealth}`}>
        <progress class="progress progress-error w-full" value={character.currentHealth} max={character.maxHealth}></progress>
    </div>
    {#if (gameState.dm || character.player_name === gameState.name) && callback !== null}
    <button class="btn btn-ghost btn-square absolute top-1 right-1 btn-sm" aria-label="View Character" onclick={callback}>
        <i class="fa-solid fa-circle-info"></i>
    </button>
    {/if}
</div>