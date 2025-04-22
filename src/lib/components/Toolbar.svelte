<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { appState, character_open, characterImportModal, characters_open, fogState, gameState, getCharacter, markerModal, Tools } from "../../routes/state.svelte";
    import CharacterPreview from "./CharacterPreview.svelte";
    import CharacterSheet from "./CharacterSheet.svelte";
    import { PutScene } from "$lib/types/messaging/client_messages";
    import { MessageTypes, notify } from "../../routes/notifications.svelte";

    function selectTool(tool: Tools) {
        if (appState.selected_tool === tool) {
            appState.selected_tool = Tools.None;
        } else {
            appState.selected_tool = tool
        }
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

    function hotkeyHandler(evt: any) {
        const activeElement = document.activeElement;
        
        const isTyping =
            activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA');
        
        if (isTyping) return;

        if(evt.ctrlKey) {
            appState.ctrlPressed = true;
        }

        switch (evt.code) {
            case 'KeyL':
                selectTool(Tools.Ruler);
                break;
            case 'KeyY':
                if (gameState.dm) {    
                    selectTool(Tools.Pointer);
                }
                break;
            case 'KeyF':
                if (gameState.dm) {
                    if (evt.shiftKey) {
                        fillAll();
                    } else {
                        selectTool(Tools.AddFog);
                    }
                }
                break;
            case 'KeyG':
                if (gameState.dm) {
                    if (evt.shiftKey) {
                        removeAll();
                    } else {
                        selectTool(Tools.RemoveFog);
                    }
                }
                break;
            case 'KeyM':
                if (gameState.dm) {
                    markerModal.value?.showModal();
                }
                break;
            case 'KeyC':
                characters_open.value = !characters_open.value
                break;
            case 'BracketRight':
                if (evt.ctrlKey) {
                    appState.prev_zoom = appState.zoom;
                    appState.zoom *= 1.25;
                }
                break;
            case 'Slash':
                if (evt.ctrlKey && appState.zoom > 0.3) {
                    appState.prev_zoom = appState.zoom;
                    appState.zoom /= 1.25;
                }
                break;
        }
    }

    function wheelHandler(evt: any) {
        if (evt.ctrlKey) {
            evt.preventDefault();

            const snapThreshold = 0.05;

            const zoomSensitivity = 0.001;
            const zoomChange = 1 - evt.deltaY * zoomSensitivity;

            const newZoom = appState.zoom * zoomChange;

            if (newZoom > 0.3) {
                appState.prev_zoom = appState.zoom;
                appState.zoom = Math.abs(newZoom - 1) < snapThreshold ? 1 : 
                    Math.abs(newZoom - appState.verticalSnapPoint) < snapThreshold ? appState.verticalSnapPoint : newZoom;
            }
        }
    }

    let fog_active = $derived(appState.selected_tool === Tools.AddFog || appState.selected_tool === Tools.RemoveFog);

    function saveSceneFog() {
        if (!appState.ws || !gameState.scene) return;
        appState.ws.send(PutScene.update_fog(gameState.scene.state.fog_squares));
        notify("Nebel aktualisiert", MessageTypes.Success, 1000);
    }

    function fillAll() {
        if (!gameState.scene) return;

        let edit_players = fogState.selected_player === "all" ? gameState.users.map((user) => user.name) : [fogState.selected_player]
        for (const player of edit_players) {
            gameState.scene.state.fog_squares[player] = [];
            for (let x = 0; x < gameState.scene.columns; x++) {
                // @ts-ignore
                for (let y = 0; y < gameState.scene.rows; y++) {
                    gameState.scene.state.fog_squares[player].push([x, y]);
                }
            }
        }
        saveSceneFog();
    }

    function removeAll() {
        if (!gameState.scene) return;

        let edit_players = fogState.selected_player === "all" ? gameState.users.map((user) => user.name) : [fogState.selected_player]
        for (const player of edit_players) {
            gameState.scene.state.fog_squares[player] = [];
        }
        saveSceneFog();
    }

    let scroll_container: any = $state(null);

    $effect(() => {
        if (!scroll_container) return;

        character_open.value;
        scroll_container.scrollTop = 0
    });
</script>

<svelte:window onkeydown={hotkeyHandler} onkeyup={(e) => {if (!e.ctrlKey) appState.ctrlPressed = false}} on:wheel|nonpassive={wheelHandler}></svelte:window>

<div class="flex flex-row gap-1 h-full pointer-events-none">
    {#if characters_open.value}
    <div class="relative h-full w-96 rounded-box frosted pointer-events-auto overflow-y-auto overscroll-contain flex flex-col" transition:fly|global={{x:-50, duration: 200}} bind:this={scroll_container}>
        {#if !character_open.value}
            <div class="p-2 px-4">
                <h1 class="text-3xl font-bold">Charaktere</h1>
                <div class="flex flex-row flex-wrap gap-2 mt-2">
                    {#each gameState.characters as character}
                        <CharacterPreview character={character} callback={() => {character_open.value = character.name}}></CharacterPreview>
                    {/each}
                    {#if gameState.dm}
                    <button class="btn" onclick={() => {characterImportModal.value?.showModal()}}>Charakter Importieren</button>
                    {/if}
                </div>
            </div>
        {:else}
            <div class="flex flex-row gap-1 items-center frosted dark-frosted py-2 rounded-box rounded-b-none">
                <button class="btn btn-square btn-ghost btn-sm" aria-label="Zurück" onclick={() => {character_open.value = ""}}>
                    <i class="fa-solid fa-arrow-left"></i>
                </button>
                {#if getCharacter(character_open.value)}
                <div class="flex flex-col">
                    <span class="text-sm">{getCharacter(character_open.value).name}</span>
                    <span class="text-xs font-bold text-gray-400">{getCharacter(character_open.value).detailedDescription}</span>
                </div>
                {/if}
            </div>
            {#if getCharacter(character_open.value)}
                <CharacterSheet character={getCharacter(character_open.value)}/>
            {/if}
        {/if}
    </div>
    {/if}
    
    <div class="flex flex-col gap-1 p-1 frosted rounded-box h-min pointer-events-auto" transition:fade|global={{duration: 100}}>
        {#if gameState.dm}
        <div class="tooltip tooltip-right">
            <div class="tooltip-content">
                Zeiger <kbd class="kbd">Z</kbd>
            </div>
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
                    <div class="tooltip tooltip-bottom p-0">
                        <div class="tooltip-content">
                            Nebel hinzufügen <kbd class="kbd">F</kbd>
                        </div>
                        <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.AddFog && 'btn-info'}" aria-label="Nebel hinzufügen" onclick={() => {selectTool(Tools.AddFog)}}>
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    </div>
                    <div class="tooltip tooltip-bottom p-0">
                        <div class="tooltip-content">
                            Nebel entfernen <kbd class="kbd">G</kbd>
                        </div>
                        <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.RemoveFog && 'btn-info'}" aria-label="Nebel entfernen" onclick={() => {selectTool(Tools.RemoveFog)}}>
                            <i class="fa-solid fa-eraser"></i>
                        </button>
                    </div>
                    <div class="tooltip tooltip-bottom p-0">
                        <div class="tooltip-content">
                            Alles ausfüllen <kbd class="kbd">SHIFT</kbd> + <kbd class="kbd">F</kbd>
                        </div>
                        <button tabindex="0" class="btn btn-square btn-sm" aria-label="Alles ausfüllen" onclick={fillAll}>
                            <i class="fa-solid fa-fill-drip"></i>
                        </button>
                    </div>
                    <div class="tooltip tooltip-bottom p-0">
                        <div class="tooltip-content">
                            Alles entfernen <kbd class="kbd">SHIFT</kbd> + <kbd class="kbd">G</kbd>
                        </div>
                        <button tabindex="0" class="btn btn-square btn-sm" aria-label="Alles entfernen" onclick={removeAll}>
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </li>
            </ul>
        </div>
        <div class="tooltip tooltip-right">
            <div class="tooltip-content">
                Marker <kbd class="kbd">M</kbd>
            </div>
            <button tabindex="0" class="btn btn-square btn-sm" aria-label="Marker" onclick={() => {markerModal.value?.showModal();}}>
                <i class="fa-solid fa-location-pin"></i>
            </button>
        </div>
        {/if}
        <div class="tooltip tooltip-right">
            <div class="tooltip-content">
                Charaktere <kbd class="kbd">C</kbd> <span class="text-gray-400">(wildly unfertig)</span>
            </div>
            <button tabindex="0" class="btn btn-square btn-sm {characters_open.value && 'btn-info'}" aria-label="Marker" onclick={() => {characters_open.value = !characters_open.value}}>
                <i class="fa-solid fa-user"></i>
            </button>
        </div>
        <div class="tooltip tooltip-right">
            <div class="tooltip-content">
                Lineal <kbd class="kbd">L</kbd>
            </div>
            <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.Ruler && 'btn-info'}" aria-label="Lineal" onclick={() => {selectTool(Tools.Ruler)}}>
                <i class="fa-solid fa-ruler"></i>
            </button>
        </div>
    </div>
</div>