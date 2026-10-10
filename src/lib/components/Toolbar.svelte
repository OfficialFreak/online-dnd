<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import {
        appState,
        toolbarState,
        fogState,
        gameState,
        getCharacter,
        modals,
        Tools,
        advance_turn,
        previous_turn,
        get_own_character,
        togglePanel,
    } from "../state.svelte";
    import { dragSource, fileDropState } from "../drag.svelte";
    import CharacterPreview from "./CharacterPreview.svelte";
    import CharacterSheet from "./CharacterSheet.svelte";
    import MarkerPanel from "./MarkerPanel.svelte";
    import ScenePanel from "./ScenePanel.svelte";
    import {
        CombatState,
        ImportCharacter,
        PutScene,
        TogglePressure,
    } from "$lib/types/messaging/client_messages";
    import { MessageTypes, notify } from "../notifications.svelte";

    function selectTool(tool: Tools) {
        if (appState.selectedTool === tool) {
            appState.selectedTool = Tools.None;
        } else {
            appState.selectedTool = tool;
        }
    }

    // Fog editing needs an array for every player. Existing fog is never reset here:
    // players may have different fog on purpose, and wiping it would be saved with the next stroke.
    $effect(() => {
        if (!fog_active || !gameState.scene) return;
        for (const player of gameState.users) {
            if (gameState.scene.state.fog_squares[player.name]) continue;
            gameState.scene.state.fog_squares[player.name] = empty_fog();
        }
    });

    function empty_fog(): number[] {
        if (!gameState.scene) return [];
        return new Array<number>(
            Math.ceil((gameState.scene.columns * gameState.scene.rows) / 32),
        ).fill(0);
    }

    async function hotkeyHandler(evt: any) {
        const activeElement = document.activeElement;

        const isTyping =
            activeElement &&
            (activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA");

        if (isTyping) return;

        if (evt.ctrlKey) {
            appState.ctrlPressed = true;
        }

        // Ctrl+C and friends belong to the system, only zoom uses Ctrl
        if (
            (evt.ctrlKey || evt.metaKey || evt.altKey) &&
            evt.code !== "BracketRight" &&
            evt.code !== "Slash"
        )
            return;

        switch (evt.code) {
            case "KeyK":
                if (gameState.dm) {
                    toggleCombat();
                }
                break;
            case "KeyP":
                if (gameState.dm) {
                    toggle_pressure();
                }
                break;
            case "KeyS":
                if (gameState.dm) {
                    togglePanel("scenes");
                }
                break;
            case "KeyR":
                await updateCharacter();
                break;
            case "KeyL":
                selectTool(Tools.Ruler);
                break;
            case "KeyY":
                if (gameState.dm) {
                    selectTool(Tools.Pointer);
                }
                break;
            case "KeyF":
                if (gameState.dm) {
                    if (evt.shiftKey) {
                        fillAll();
                    } else {
                        selectTool(Tools.AddFog);
                    }
                }
                break;
            case "KeyG":
                if (gameState.dm) {
                    if (evt.shiftKey) {
                        removeAll();
                    } else {
                        selectTool(Tools.RemoveFog);
                    }
                }
                break;
            case "KeyM":
                if (gameState.dm) {
                    togglePanel("markers");
                }
                break;
            case "KeyC":
                togglePanel("characters");
                break;
            case "BracketRight":
                if (evt.ctrlKey) {
                    appState.prevZoom = appState.zoom;
                    appState.zoom *= 1.25;
                }
                break;
            case "Slash":
                if (evt.ctrlKey && appState.zoom > 0.3) {
                    appState.prevZoom = appState.zoom;
                    appState.zoom /= 1.25;
                }
                break;
            case "ArrowLeft":
                await previous_turn();
                break;
            case "ArrowRight":
                await advance_turn();
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
                appState.prevZoom = appState.zoom;
                appState.zoom =
                    Math.abs(newZoom - 1) < snapThreshold
                        ? 1
                        : Math.abs(newZoom - appState.verticalSnapPoint) <
                            snapThreshold
                          ? appState.verticalSnapPoint
                          : newZoom;
            }
        }
    }

    async function updateCharacter() {
        const own_character = get_own_character();
        if (!appState.ws || !own_character) return;
        await appState.ws.send(
            ImportCharacter.create(
                own_character.readonlyUrl,
                own_character.player_name,
            ),
        );
        notify("Charakter wird aktualisiert", MessageTypes.Success, 2000);
    }

    let fog_active = $derived(
        appState.selectedTool === Tools.AddFog ||
            appState.selectedTool === Tools.RemoveFog,
    );

    function saveSceneFog() {
        if (!appState.ws || !gameState.scene) return;
        appState.ws.send(
            PutScene.update_fog(gameState.scene.state.fog_squares),
        );
        notify("Nebel aktualisiert", MessageTypes.Success, 1000);
    }

    function fillAll() {
        if (!gameState.scene) return;

        let edit_players =
            fogState.selected_player === "all"
                ? gameState.users.map((user) => user.name)
                : [fogState.selected_player];
        for (const player of edit_players) {
            gameState.scene.state.fog_squares[player] = new Array(
                Math.ceil(
                    (gameState.scene.columns * gameState.scene.rows) / 32,
                ),
            );
            gameState.scene.state.fog_squares[player].fill(-1);
        }
        saveSceneFog();
    }

    function removeAll() {
        if (!gameState.scene) return;

        let edit_players =
            fogState.selected_player === "all"
                ? gameState.users.map((user) => user.name)
                : [fogState.selected_player];
        for (const player of edit_players) {
            gameState.scene.state.fog_squares[player] = empty_fog();
        }
        saveSceneFog();
    }

    function toggleCombat() {
        gameState.combat = !gameState.combat;
        if (appState.ws) {
            appState.ws.send(CombatState.create(gameState.combat));
        }
    }

    let scroll_container: any = $state(null);

    $effect(() => {
        if (!scroll_container) return;

        toolbarState.characterOpen;
        scroll_container.scrollTop = 0;
    });

    // The server echoes this back to everyone, which updates gameState.pressure
    async function toggle_pressure() {
        if (!appState.ws) return;
        await appState.ws.send(TogglePressure.create(!gameState.pressure));
    }
</script>

<svelte:window
    onkeydown={hotkeyHandler}
    onkeyup={(e) => {
        if (!e.ctrlKey) appState.ctrlPressed = false;
    }}
    onblur={() => {
        // The keyup never arrives when Ctrl is released in another window
        appState.ctrlPressed = false;
    }}
    on:wheel|nonpassive={wheelHandler}
/>

<div
    class="fixed top-10 left-2 bottom-16 flex flex-row gap-1 pointer-events-none"
>
    {#if toolbarState.panel}
        <div
            class="relative h-full w-96 rounded-box frosted pointer-events-auto overflow-y-auto overscroll-contain flex flex-col transition-shadow {fileDropState.over &&
            fileDropState.over === toolbarState.panel
                ? 'ring-4 ring-info'
                : ''}"
            transition:fly|global={{ x: -50, duration: 200 }}
            bind:this={scroll_container}
            data-file-drop={toolbarState.panel}
        >
            {#if toolbarState.panel === "markers"}
                <MarkerPanel />
            {:else if toolbarState.panel === "scenes"}
                <ScenePanel />
            {:else if !toolbarState.characterOpen}
                <div class="p-2 px-4">
                    <h1 class="text-3xl font-bold">Charaktere</h1>
                    {#if gameState.dm}
                        <p class="text-sm text-base-content/60 mt-2">
                            Zieh einen Charakter auf die Karte, um seinen Marker
                            dort zu platzieren.
                        </p>
                    {/if}
                    <div class="flex flex-row flex-wrap gap-2 mt-2">
                        {#each gameState.characters as character}
                            {@const marker = gameState.dm
                                ? gameState.markerLib.find(
                                      (marker) => marker.name === character.name,
                                  )
                                : undefined}
                            {#if marker}
                                <div
                                    class="grow flex cursor-grab active:cursor-grabbing select-none touch-none"
                                    use:dragSource={{ kind: "marker", marker }}
                                >
                                    <CharacterPreview
                                        {character}
                                        callback={() => {
                                            toolbarState.characterOpen =
                                                character.name;
                                        }}
                                    ></CharacterPreview>
                                </div>
                            {:else}
                                <CharacterPreview
                                    {character}
                                    callback={() => {
                                        toolbarState.characterOpen =
                                            character.name;
                                    }}
                                ></CharacterPreview>
                            {/if}
                        {/each}
                        {#if gameState.dm}
                            <button
                                class="btn"
                                onclick={() => {
                                    modals.characterImportModal?.showModal();
                                }}>Charakter Importieren</button
                            >
                        {/if}
                    </div>
                </div>
            {:else}
                <div
                    class="flex flex-row gap-1 items-center frosted dark-frosted py-2 rounded-box rounded-b-none"
                >
                    <button
                        class="btn btn-square btn-ghost btn-sm"
                        aria-label="Zurück"
                        onclick={() => {
                            toolbarState.characterOpen = "";
                        }}
                    >
                        <i class="fa-solid fa-arrow-left"></i>
                    </button>
                    {#if getCharacter(toolbarState.characterOpen)}
                        <div class="flex flex-col">
                            <span class="text-sm"
                                >{getCharacter(toolbarState.characterOpen)
                                    .name}</span
                            >
                            <span class="text-xs font-bold text-base-content/50"
                                >{getCharacter(toolbarState.characterOpen)
                                    .detailedDescription}</span
                            >
                        </div>
                    {/if}
                </div>
                {#if getCharacter(toolbarState.characterOpen)}
                    <CharacterSheet
                        character={getCharacter(toolbarState.characterOpen)}
                    />
                {/if}
            {/if}
        </div>
    {/if}

    <div
        class="flex flex-col gap-1 p-1 frosted rounded-box h-min pointer-events-auto"
        transition:fade|global={{ duration: 100 }}
    >
        {#if gameState.dm}
            <div class="tooltip tooltip-right">
                <div class="tooltip-content">
                    Zeiger <kbd class="kbd">Z</kbd>
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {appState.selectedTool ===
                    Tools.Pointer
                        ? 'btn-info'
                        : ''}"
                    aria-label="Zeiger"
                    onclick={() => {
                        selectTool(Tools.Pointer);
                    }}><i class="fa-solid fa-arrow-pointer"></i></button
                >
            </div>
            <div class="tooltip tooltip-right">
                <div class="tooltip-content">
                    Szenen <kbd class="kbd">S</kbd>
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {toolbarState.panel ===
                    'scenes'
                        ? 'btn-info'
                        : ''}"
                    aria-label="Szenen"
                    onclick={() => {
                        togglePanel("scenes");
                    }}><i class="fa-solid fa-map"></i></button
                >
            </div>
            <div class="tooltip tooltip-right">
                <div class="tooltip-content">
                    {#if gameState.pressure}
                        Chill Pill
                    {:else}
                        Pressure
                    {/if} <kbd class="kbd">P</kbd>
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {gameState.pressure
                        ? 'btn-info'
                        : ''}"
                    aria-label="Pressure"
                    onclick={toggle_pressure}
                    ><i class="fa-solid fa-stopwatch"></i></button
                >
            </div>
            <div class="dropdown dropdown-right dropdown-hover">
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {fog_active
                        ? 'btn-info'
                        : ''}"
                    aria-label="Fog"><i class="fa-solid fa-cloud"></i></button
                >
                <ul
                    class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 shadow-sm"
                >
                    <li>
                        <h3
                            class="-ml-2 font-bold pointer-events-none -my-1 text-base"
                        >
                            Nebel
                        </h3>
                        <legend
                            class="-ml-2 fieldset-legend pointer-events-none"
                            >Spieler wählen</legend
                        >
                        <select
                            class="select select-sm !bg-[var(--color-base-100)]"
                            bind:value={fogState.selected_player}
                        >
                            <option value="all">Alle</option>
                            {#each gameState.users as player}
                                <option value={player.name}
                                    >{#if player.active}🟢{:else}🔴{/if}
                                    {player.name}</option
                                >
                            {/each}
                        </select>
                    </li>
                    <li class="flex flex-row gap-1 mt-1">
                        <div class="tooltip tooltip-bottom p-0 rounded-box">
                            <div class="tooltip-content">
                                Nebel hinzufügen <kbd class="kbd">F</kbd>
                            </div>
                            <button
                                tabindex="0"
                                class="btn btn-square btn-sm rounded-box {appState.selectedTool ===
                                Tools.AddFog
                                    ? 'btn-info'
                                    : ''}"
                                aria-label="Nebel hinzufügen"
                                onclick={() => {
                                    selectTool(Tools.AddFog);
                                }}
                            >
                                <i class="fa-solid fa-pen"></i>
                            </button>
                        </div>
                        <div class="tooltip tooltip-bottom p-0 rounded-box">
                            <div class="tooltip-content">
                                Nebel entfernen <kbd class="kbd">G</kbd>
                            </div>
                            <button
                                tabindex="0"
                                class="btn btn-square btn-sm rounded-box {appState.selectedTool ===
                                Tools.RemoveFog
                                    ? 'btn-info'
                                    : ''}"
                                aria-label="Nebel entfernen"
                                onclick={() => {
                                    selectTool(Tools.RemoveFog);
                                }}
                            >
                                <i class="fa-solid fa-eraser"></i>
                            </button>
                        </div>
                        <div class="tooltip tooltip-bottom p-0 rounded-box">
                            <div class="tooltip-content">
                                Alles ausfüllen <kbd class="kbd">SHIFT</kbd> +
                                <kbd class="kbd">F</kbd>
                            </div>
                            <button
                                tabindex="0"
                                class="btn btn-square btn-sm rounded-box"
                                aria-label="Alles ausfüllen"
                                onclick={fillAll}
                            >
                                <i class="fa-solid fa-fill-drip"></i>
                            </button>
                        </div>
                        <div class="tooltip tooltip-bottom p-0 rounded-box">
                            <div class="tooltip-content">
                                Alles entfernen <kbd class="kbd">SHIFT</kbd> +
                                <kbd class="kbd">G</kbd>
                            </div>
                            <button
                                tabindex="0"
                                class="btn btn-square btn-sm rounded-box"
                                aria-label="Alles entfernen"
                                onclick={removeAll}
                            >
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
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {toolbarState.panel ===
                    'markers'
                        ? 'btn-info'
                        : ''}"
                    aria-label="Marker"
                    onclick={() => {
                        togglePanel("markers");
                    }}
                >
                    <i class="fa-solid fa-location-pin"></i>
                </button>
            </div>
            <div class="tooltip tooltip-right">
                <div class="tooltip-content">
                    Kampf <kbd class="kbd">K</kbd>
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {gameState.combat
                        ? 'btn-info'
                        : ''}"
                    aria-label="Zeiger"
                    onclick={() => {
                        toggleCombat();
                    }}><i class="fa-solid fa-hand-fist"></i></button
                >
            </div>
        {/if}
        <div class="tooltip tooltip-right">
            <div class="tooltip-content">
                Charaktere <kbd class="kbd">C</kbd>
            </div>
            <button
                tabindex="0"
                class="btn btn-square btn-sm rounded-box {toolbarState.panel ===
                'characters'
                    ? 'btn-info'
                    : ''}"
                aria-label="Charaktere"
                onclick={() => {
                    togglePanel("characters");
                }}
            >
                <i class="fa-solid fa-user"></i>
            </button>
        </div>
        {#if !gameState.dm}
            <div class="tooltip tooltip-right">
                <div class="tooltip-content">
                    Charakter Aktualisieren <kbd class="kbd">R</kbd>
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box"
                    aria-label="Charakter Aktualisieren"
                    onclick={updateCharacter}
                >
                    <i class="fa-solid fa-rotate-right"></i>
                </button>
            </div>
        {/if}
        <div class="tooltip tooltip-right">
            <div class="tooltip-content">
                Lineal <kbd class="kbd">L</kbd>
            </div>
            <button
                tabindex="0"
                class="btn btn-square btn-sm rounded-box {appState.selectedTool ===
                Tools.Ruler
                    ? 'btn-info'
                    : ''}"
                aria-label="Lineal"
                onclick={() => {
                    selectTool(Tools.Ruler);
                }}
            >
                <i class="fa-solid fa-ruler"></i>
            </button>
        </div>
    </div>
</div>
