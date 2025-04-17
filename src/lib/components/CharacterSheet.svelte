<script lang="ts">
    import CharacterPreview from "./CharacterPreview.svelte";
    import Stat from "./CharacterSheet/Stat.svelte";

    let { character } = $props();
</script>

<div class="w-full h-full flex flex-col">
    <img class="absolute top-0 left-0 -z-10 w-full h-full object-cover object-center rounded-box" src={character.decorations.backdropAvatarUrl} alt="Background">
    <CharacterPreview character={character} />
    <div class="dropdown dropdown-hover mt-1">
        <div tabindex="0" role="button" class="btn !text-xs px-2 w-full">
            Abilities, Saves, Senses
        </div>
        <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-full p-2 shadow-sm">
            <li><button class="btn btn-ghost justify-start">Abilities, Saves, Senses</button></li>
            <li><button class="btn btn-ghost justify-start">Skills</button></li>
            <li><button class="btn btn-ghost justify-start">Actions</button></li>
        </ul>
    </div>
    <div class="relative w-full h-full grow mt-1">
        <div class="w-full flex flex-wrap gap-y-1">
            {#each character.stats as stat}
                <Stat stat={stat} color={character.decorations.themeColor.themeColor} />
            {/each}
        </div>
        <h1>Saving Throws</h1>
        alle saving throws

        <h1>Senses</h1>
        Passive zeug
        darkvision 60 ft.
    </div>
</div>