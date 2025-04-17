<script lang="ts">
    import { PutScene } from "$lib/types/messaging/client_messages";
    import { fade, fly } from "svelte/transition";
    import { appState, character_open, characters_open, fogState, gameState, getCharacter, markerModal, Tools } from "../../routes/state.svelte";
    import { MessageTypes, notify } from "../../routes/notifications.svelte";
    import CharacterPreview from "./CharacterPreview.svelte";
    import CharacterSheet from "./CharacterSheet.svelte";

    function selectTool(tool: Tools) {
        if (appState.selected_tool === tool) {
            appState.selected_tool = Tools.None;
        } else {
            appState.selected_tool = tool
        }
    }

    function saveSceneFog() {
        if (!appState.ws || !gameState.scene) return;
        appState.ws.send(PutScene.update_fog(gameState.scene.state.fog_squares));
        notify("Nebel aktualisiert", MessageTypes.Success, 1000);
    }

    $effect(() => {
        if (fog_active && gameState.scene && fogState.selected_player === "all") {
            let all_compatible = false;
            if (gameState.users.length > 0) {
                all_compatible = true;
                let fog = JSON.stringify(gameState.scene.state.fog_squares[gameState.users[0].name]);
                for (const player of gameState.users) {
                    if (fog !== JSON.stringify(gameState.scene.state.fog_squares[player.name])) {
                        all_compatible = false;
                        break;
                    }
                }
            }
            if (all_compatible) return;
            gameState.scene.state.fog_squares = {};
            for (const player of gameState.users) {
                gameState.scene.state.fog_squares[player.name] = [];
            }
        }
    });

    let fog_active = $derived(appState.selected_tool === Tools.AddFog || appState.selected_tool === Tools.RemoveFog);
</script>

<div class="flex flex-row gap-1 h-full pointer-events-none">
    {#if characters_open.value}
    <div class="h-full w-96 rounded-box frosted pointer-events-auto" transition:fly|global={{x:-50, duration: 200}}>
        {#if !character_open.value}
            <div class="p-2 px-4">
                <h1 class="text-3xl font-bold">Charaktere</h1>
                <div class="flex flex-row flex-wrap gap-2 mt-2">
                    {#each gameState.characters as character}
                        <CharacterPreview character={character} callback={() => {character_open.value = character.name}}></CharacterPreview>
                    {/each}
                </div>
            </div>
        {:else}
            <div class="flex flex-row gap-1 items-center frosted dark-frosted py-2 rounded-box rounded-b-none">
                <button class="btn btn-square btn-ghost btn-sm" aria-label="Zurück" onclick={() => {character_open.value = ""}}>
                    <i class="fa-solid fa-arrow-left"></i>
                </button>
                <div class="flex flex-col">
                    <span class="text-sm">{getCharacter(character_open.value).name}</span>
                    <span class="text-xs font-bold text-gray-400">{getCharacter(character_open.value).detailedDescription}</span>
                </div>
            </div>
            <CharacterSheet character={getCharacter(character_open.value)}/>
        {/if}
    </div>
    {/if}
    
    <div class="flex flex-col gap-1 p-1 frosted rounded-box h-min pointer-events-auto" transition:fade|global={{duration: 100}}>
        {#if gameState.dm}
        <div class="tooltip tooltip-right" data-tip="Zeiger">
            <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.Pointer && 'btn-info'}" aria-label="Zeiger" onclick={() => {selectTool(Tools.Pointer)}}><i class="fa-solid fa-arrow-pointer"></i></button>
        </div>
        <div class="dropdown dropdown-right dropdown-hover">
            <button tabindex="0" class="btn btn-square btn-sm {fog_active && 'btn-info'}" aria-label="Fog"><i class="fa-solid fa-cloud"></i></button>
            <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 shadow-sm">
                <li>
                    <h3 class="-ml-2 font-bold pointer-events-none -my-1 text-base">Nebel</h3>
                    <legend class="-ml-2 fieldset-legend pointer-events-none">Spieler wählen</legend>
                    <select class="select select-sm !bg-[var(--color-base-100)]" bind:value={fogState.selected_player}>
                        <option value="all">Alle</option>
                        {#each gameState.users as player}
                            <option value={player.name}>{#if player.active}🟢{:else}🔴{/if} {player.name}</option>
                        {/each}
                    </select>
                </li>
                <li class="flex flex-row gap-1 mt-1">
                    <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.AddFog && 'btn-info'}" aria-label="Fog" onclick={() => {selectTool(Tools.AddFog)}}><i class="fa-solid fa-pen"></i></button>
                    <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.RemoveFog && 'btn-info'}" aria-label="Fog" onclick={() => {selectTool(Tools.RemoveFog)}}><i class="fa-solid fa-eraser"></i></button>
                    <button tabindex="0" class="btn btn-neutral btn-sm self-end ml-5" onclick={saveSceneFog}>
                        <i class="fa-solid fa-check"></i>
                        Bestätigen
                    </button>
                </li>
            </ul>
        </div>
        <div class="tooltip tooltip-right" data-tip="Marker">
            <button tabindex="0" class="btn btn-square btn-sm" aria-label="Marker" onclick={() => {markerModal.value?.showModal();}}>
                <i class="fa-solid fa-location-pin"></i>
            </button>
        </div>
        {/if}
        <div class="tooltip tooltip-right" data-tip="Charaktere (Wildly unfertig)">
            <button tabindex="0" class="btn btn-square btn-sm {characters_open.value && 'btn-info'}" aria-label="Marker" onclick={() => {characters_open.value = !characters_open.value}}>
                <i class="fa-solid fa-user"></i>
            </button>
        </div>
        <div class="tooltip tooltip-right" data-tip="Lineal (Coming Soon-ish)">
            <button tabindex="0" disabled class="btn btn-square btn-sm {characters_open.value && 'btn-info'}" aria-label="Marker" onclick={() => {characters_open.value = !characters_open.value}}>
                <i class="fa-solid fa-ruler"></i>
            </button>
        </div>
    </div>
</div>