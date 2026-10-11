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
        place_party,
        reset_round,
        record_undo,
        undo,
        redo,
        undoState,
        selection,
        remove_markers,
        drawState,
    } from "../state.svelte";
    import { DRAWING_COLORS, DRAWING_KINDS } from "$lib/drawings";
    import { keep_in_view } from "$lib/keep-in-view";
    import { dragState, fileDropState } from "../drag.svelte";
    import CharacterPreview from "./CharacterPreview.svelte";
    import CharacterSheet from "./CharacterSheet.svelte";
    import MarkerPanel from "./MarkerPanel.svelte";
    import ScenePanel from "./ScenePanel.svelte";
    import RollLog from "./RollLog.svelte";
    import SoundPanel from "./SoundPanel.svelte";
    import {
        DeleteDrawings,
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

    // On touch screens the fog and measuring menus open with a tap and close with a tap
    // next to them. Hover doesn't exist there, and Safari keeps the focus that would
    // otherwise close them.
    let touch = $state(false);
    let open_menu: "fog" | "measure" | null = $state(null);

    function menu_state(menu: "fog" | "measure") {
        if (!touch) return "";
        return open_menu === menu ? "dropdown-open" : "dropdown-close";
    }

    function tap_menu(menu: "fog" | "measure") {
        if (touch) open_menu = open_menu === menu ? null : menu;
    }

    /** Picking a tool in a menu closes it on touch screens, the map is under it */
    function pick_tool(tool: Tools) {
        appState.selectedTool = tool;
        open_menu = null;
    }

    function on_pointer_down(event: PointerEvent) {
        touch = event.pointerType !== "mouse";
        if (
            open_menu &&
            !(event.target as HTMLElement).closest(`[data-menu="${open_menu}"]`)
        ) {
            open_menu = null;
        }
    }

    // The ruler and drawing share a button, which picks up the one used last
    let measuring = $derived(
        appState.selectedTool === Tools.Ruler ||
            appState.selectedTool === Tools.Draw,
    );
    let last_measure_tool = $state(Tools.Ruler);
    $effect(() => {
        if (measuring) last_measure_tool = appState.selectedTool;
    });

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

    // Ctrl + these zooms: + and - (German and US layouts, numpad) and 0 to reset
    const ZOOM_KEYS = [
        "BracketRight",
        "Equal",
        "NumpadAdd",
        "Slash",
        "Minus",
        "NumpadSubtract",
        "Digit0",
        "Numpad0",
    ];

    async function hotkeyHandler(evt: any) {
        const activeElement = document.activeElement;

        // Letters also pick an option in a focused select
        const isTyping =
            activeElement &&
            (activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA" ||
                activeElement.tagName === "SELECT" ||
                (activeElement as HTMLElement).isContentEditable);

        // Typing in a dialog, e.g. a monster search after clicking a result, isn't a shortcut
        if (isTyping || document.querySelector("dialog[open]")) return;

        if (evt.ctrlKey) {
            appState.ctrlPressed = true;
        }

        // By the character, not the key: Z and Y are swapped on German keyboards
        if (evt.ctrlKey && !evt.altKey && gameState.dm) {
            const key = evt.key.toLowerCase();
            if (key === "z" || key === "y") {
                evt.preventDefault();
                if (key === "z" && !evt.shiftKey) await undo();
                else await redo();
                return;
            }
        }

        // Ctrl+C and friends belong to the system, only zoom uses Ctrl
        if (
            (evt.ctrlKey || evt.metaKey || evt.altKey) &&
            !(evt.ctrlKey && ZOOM_KEYS.includes(evt.code))
        )
            return;

        switch (evt.code) {
            case "Delete":
            case "Backspace":
                if (gameState.dm && selection.size > 0) {
                    await remove_markers([...selection]);
                }
                break;
            case "Escape":
                selection.clear();
                break;
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
            case "KeyD":
                selectTool(Tools.Draw);
                break;
            case "KeyY":
                selectTool(Tools.Pointer);
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
            case "KeyV":
                togglePanel("rolls");
                break;
            case "KeyB":
                if (gameState.dm) {
                    togglePanel("sounds");
                }
                break;
            // "+" is BracketRight and "-" is Slash on German keyboards
            case "BracketRight":
            case "Equal":
            case "NumpadAdd":
                if (evt.ctrlKey) {
                    evt.preventDefault();
                    appState.zoom_by?.(1.25);
                }
                break;
            case "Slash":
            case "Minus":
            case "NumpadSubtract":
                if (evt.ctrlKey) {
                    evt.preventDefault();
                    appState.zoom_by?.(1 / 1.25);
                }
                break;
            case "Digit0":
            case "Numpad0":
                if (evt.ctrlKey) {
                    evt.preventDefault();
                    appState.zoom_by?.(1 / appState.zoom);
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
        record_undo();

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
        record_undo();

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
        // A new combat starts in the first round
        if (gameState.combat) reset_round();
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
    onpointerdowncapture={on_pointer_down}
    onkeydown={hotkeyHandler}
    onkeyup={(e) => {
        if (!e.ctrlKey) appState.ctrlPressed = false;
    }}
    onblur={() => {
        // The keyup never arrives when Ctrl is released in another window
        appState.ctrlPressed = false;
    }}
/>

<div
    class="fixed top-[calc(2.5rem+var(--safe-top))] left-[calc(0.5rem+var(--safe-left))] bottom-[calc(4rem+var(--safe-bottom))] flex flex-row gap-1 pointer-events-none"
>
    {#if toolbarState.panel}
        <!-- Out of the way while a marker or scene is dragged from it onto the map. Hidden,
             not closed: that would end the drag. -->
        <div
            class="relative h-full w-[min(24rem,calc(100vw-4rem))] rounded-box frosted pointer-events-auto overflow-y-auto overscroll-contain flex flex-col *:shrink-0 transition-[box-shadow,opacity,translate,visibility] {fileDropState.over &&
            fileDropState.over === toolbarState.panel
                ? 'ring-4 ring-info'
                : ''} {dragState.payload
                ? 'invisible opacity-0 -translate-x-8'
                : ''}"
            transition:fly|global={{ x: -50, duration: 200 }}
            bind:this={scroll_container}
            data-file-drop={toolbarState.panel}
        >
            {#if toolbarState.panel === "markers"}
                <MarkerPanel />
            {:else if toolbarState.panel === "scenes"}
                <ScenePanel />
            {:else if toolbarState.panel === "rolls"}
                <RollLog />
            {:else if toolbarState.panel === "sounds"}
                <SoundPanel />
            {:else if !toolbarState.characterOpen}
                <div class="p-2 px-4">
                    <h1 class="text-3xl font-bold">Charaktere</h1>
                    {#if gameState.dm}
                        <p class="text-sm text-base-content/60 mt-2">
                            Zieh das Porträt eines Charakters auf die Karte, um
                            seinen Marker dort zu platzieren.
                        </p>
                    {/if}
                    <div class="flex flex-row flex-wrap gap-2 mt-2">
                        {#each gameState.characters as character}
                            <CharacterPreview
                                {character}
                                callback={() => {
                                    toolbarState.characterOpen = character.name;
                                }}
                            ></CharacterPreview>
                        {/each}
                        {#if gameState.dm}
                            <button
                                class="btn"
                                onclick={() => {
                                    modals.characterImportModal?.showModal();
                                }}>Charakter importieren</button
                            >
                            <button
                                class="btn"
                                disabled={!gameState.scene}
                                title="Stellt alle Charaktere im Kreis in die Mitte der Karte"
                                onclick={place_party}
                            >
                                <i class="fa-solid fa-people-group"></i>
                                Party platzieren
                            </button>
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
                    <!-- Data from D&D Beyond that doesn't fit only breaks this panel, not the whole app -->
                    <svelte:boundary>
                        <CharacterSheet
                            character={getCharacter(toolbarState.characterOpen)}
                        />
                        {#snippet failed()}
                            <div
                                class="p-4 flex flex-col items-center gap-2 text-center text-base-content/60"
                            >
                                <i
                                    class="fa-solid fa-triangle-exclamation text-3xl"
                                ></i>
                                Der Charakterbogen lässt sich nicht anzeigen.
                                Aktualisiere den Charakter von D&D Beyond.
                            </div>
                        {/snippet}
                    </svelte:boundary>
                {/if}
            {/if}
        </div>
    {/if}

    <div
        class="flex flex-col gap-1 p-1 frosted rounded-box h-min pointer-events-auto"
        transition:fade|global={{ duration: 100 }}
    >
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
        {#if gameState.dm}
            <div class="tooltip tooltip-right">
                <div class="tooltip-content">
                    Mehrere Marker auswählen
                    <span class="block text-xs opacity-70 pointer-coarse:hidden"
                        >Auch mit <kbd class="kbd kbd-xs">Shift</kbd> und Ziehen oder
                        Klicken</span
                    >
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {appState.selectedTool ===
                    Tools.Select
                        ? 'btn-info'
                        : ''}"
                    aria-label="Auswählen"
                    onclick={() => selectTool(Tools.Select)}
                    ><i class="fa-solid fa-vector-square"></i></button
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
            <div
                class="dropdown dropdown-right dropdown-hover {menu_state('fog')}"
                data-menu="fog"
            >
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {fog_active
                        ? 'btn-info'
                        : ''}"
                    aria-label="Fog"
                    onclick={() => tap_menu("fog")}
                    ><i class="fa-solid fa-cloud"></i></button
                >
                <div
                    class="dropdown-content bg-base-100 rounded-box z-1 w-56 p-3 shadow-sm flex flex-col gap-3"
                    style="transform: translate(var(--shift-x, 0px), var(--shift-y, 0px))"
                    use:keep_in_view
                >
                    <h3 class="font-bold">Nebel</h3>
                    <fieldset class="fieldset p-0">
                        <legend class="fieldset-legend pt-0">Spieler wählen</legend>
                        <select
                            class="select select-sm w-full"
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
                    </fieldset>
                    <fieldset class="fieldset p-0">
                        <legend class="fieldset-legend pt-0">Pinsel</legend>
                        <div class="flex flex-row gap-1">
                            <div class="join">
                                {#each [1, 3, 5] as brush}
                                    <button
                                        class="btn btn-sm btn-square join-item {fogState.shape ===
                                            'brush' && fogState.brush === brush
                                            ? 'btn-info'
                                            : ''}"
                                        title="{brush} × {brush} Felder"
                                        onclick={() => {
                                            fogState.shape = "brush";
                                            fogState.brush = brush;
                                        }}>{brush}</button
                                    >
                                {/each}
                            </div>
                            <button
                                class="btn btn-sm flex-1 {fogState.shape ===
                                'rect'
                                    ? 'btn-info'
                                    : ''}"
                                title="Ein Rechteck aufziehen, geht auch mit gedrückter Shift-Taste"
                                onclick={() => (fogState.shape = "rect")}
                            >
                                <i class="fa-regular fa-square"></i> Rechteck
                            </button>
                        </div>
                    </fieldset>
                    <div class="grid grid-cols-4 gap-1">
                        <div class="tooltip tooltip-bottom">
                            <div class="tooltip-content">
                                Nebel hinzufügen <kbd class="kbd">F</kbd>
                            </div>
                            <button
                                tabindex="0"
                                class="btn btn-sm w-full {appState.selectedTool ===
                                Tools.AddFog
                                    ? 'btn-info'
                                    : ''}"
                                aria-label="Nebel hinzufügen"
                                onclick={() => {
                                    if (touch) pick_tool(Tools.AddFog);
                                    else selectTool(Tools.AddFog);
                                }}
                            >
                                <i class="fa-solid fa-pen"></i>
                            </button>
                        </div>
                        <div class="tooltip tooltip-bottom">
                            <div class="tooltip-content">
                                Nebel entfernen <kbd class="kbd">G</kbd>
                            </div>
                            <button
                                tabindex="0"
                                class="btn btn-sm w-full {appState.selectedTool ===
                                Tools.RemoveFog
                                    ? 'btn-info'
                                    : ''}"
                                aria-label="Nebel entfernen"
                                onclick={() => {
                                    if (touch) pick_tool(Tools.RemoveFog);
                                    else selectTool(Tools.RemoveFog);
                                }}
                            >
                                <i class="fa-solid fa-eraser"></i>
                            </button>
                        </div>
                        <div class="tooltip tooltip-bottom">
                            <div class="tooltip-content">
                                Alles ausfüllen <kbd class="kbd">SHIFT</kbd> +
                                <kbd class="kbd">F</kbd>
                            </div>
                            <button
                                tabindex="0"
                                class="btn btn-sm w-full"
                                aria-label="Alles ausfüllen"
                                onclick={fillAll}
                            >
                                <i class="fa-solid fa-fill-drip"></i>
                            </button>
                        </div>
                        <div class="tooltip tooltip-bottom">
                            <div class="tooltip-content">
                                Alles entfernen <kbd class="kbd">SHIFT</kbd> +
                                <kbd class="kbd">G</kbd>
                            </div>
                            <button
                                tabindex="0"
                                class="btn btn-sm w-full"
                                aria-label="Alles entfernen"
                                onclick={removeAll}
                            >
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
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
                    Musik <kbd class="kbd">B</kbd>
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {toolbarState.panel ===
                    'sounds'
                        ? 'btn-info'
                        : ''}"
                    aria-label="Musik"
                    onclick={() => togglePanel("sounds")}
                >
                    <i class="fa-solid fa-music"></i>
                </button>
            </div>
            <div class="tooltip tooltip-right">
                <div class="tooltip-content">
                    Rückgängig <kbd class="kbd">Strg</kbd> + <kbd class="kbd"
                        >Z</kbd
                    ><br />Wiederholen <kbd class="kbd">Strg</kbd> +
                    <kbd class="kbd">Y</kbd>
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box"
                    aria-label="Rückgängig"
                    disabled={undoState.undo === 0}
                    onclick={undo}
                >
                    <i class="fa-solid fa-arrow-rotate-left"></i>
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
                    aria-label="Kampf"
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
        <div class="tooltip tooltip-right">
            <div class="tooltip-content">
                Verlauf <kbd class="kbd">V</kbd>
            </div>
            <button
                tabindex="0"
                class="btn btn-square btn-sm rounded-box {toolbarState.panel ===
                'rolls'
                    ? 'btn-info'
                    : ''}"
                aria-label="Verlauf"
                onclick={() => {
                    togglePanel("rolls");
                }}
            >
                <i class="fa-solid fa-clock-rotate-left"></i>
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
        <!-- Drawings are measurements that stay, so they share the ruler's button -->
        <div
            class="dropdown dropdown-right dropdown-end dropdown-hover {menu_state(
                'measure',
            )}"
            data-menu="measure"
        >
            <button
                tabindex="0"
                class="btn btn-square btn-sm rounded-box {measuring
                    ? 'btn-info'
                    : ''}"
                aria-label="Messen und Zeichnen"
                onclick={() => {
                    selectTool(
                        measuring ? appState.selectedTool : last_measure_tool,
                    );
                    // Tapping again puts the tool away and closes the menu
                    if (touch) open_menu = measuring ? "measure" : null;
                }}
                ><i
                    class="fa-solid {last_measure_tool === Tools.Ruler
                        ? 'fa-ruler'
                        : (DRAWING_KINDS.find(
                              (entry) => entry.kind === drawState.kind,
                          )?.icon ?? 'fa-pen-ruler')}"
                ></i></button
            >
            <div
                class="dropdown-content bg-base-100 rounded-box z-1 w-72 p-3 shadow-sm flex flex-col gap-3"
                style="transform: translate(var(--shift-x, 0px), var(--shift-y, 0px))"
                use:keep_in_view
            >
                <h3 class="font-bold flex flex-row items-baseline gap-2">
                    Messen & Zeichnen
                    <span
                        class="text-xs font-normal text-base-content/60 pointer-coarse:hidden"
                        ><kbd class="kbd kbd-xs">L</kbd>
                        <kbd class="kbd kbd-xs">D</kbd></span
                    >
                </h3>
                <div class="flex flex-row gap-1">
                    <button
                        class="btn btn-sm btn-square {appState.selectedTool ===
                        Tools.Ruler
                            ? 'btn-info'
                            : ''}"
                        title="Lineal, nur du siehst es"
                        aria-label="Lineal"
                        onclick={() => pick_tool(Tools.Ruler)}
                    >
                        <i class="fa-solid fa-ruler"></i>
                    </button>
                    <div class="join flex-1">
                        {#each DRAWING_KINDS as { kind, label, icon }}
                            <button
                                class="btn btn-sm join-item flex-1 {appState.selectedTool ===
                                    Tools.Draw && drawState.kind === kind
                                    ? 'btn-info'
                                    : ''}"
                                title={label}
                                aria-label={label}
                                onclick={() => {
                                    drawState.kind = kind;
                                    pick_tool(Tools.Draw);
                                }}
                            >
                                <i class="fa-solid {icon}"></i>
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="flex flex-row flex-wrap gap-2">
                    {#each DRAWING_COLORS as color}
                        <button
                            class="w-5 h-5 rounded-full border border-base-content/30 cursor-pointer {drawState.color ===
                            color
                                ? 'ring-2 ring-info ring-offset-1 ring-offset-base-100'
                                : ''}"
                            style="background: {color}"
                            aria-label="Farbe {color}"
                            onclick={() => (drawState.color = color)}
                        ></button>
                    {/each}
                </div>
                <label class="label text-sm">
                    <input
                        type="checkbox"
                        class="toggle toggle-sm"
                        bind:checked={drawState.snap}
                    />
                    Am Raster einrasten, in 5-ft-Schritten
                </label>
                <p class="text-xs text-base-content/60">
                    Das Lineal siehst nur du, Zeichnungen sehen alle.
                    <span class="pointer-coarse:hidden"
                        >Mit <kbd class="kbd kbd-xs">Strg</kbd> rasten sie auch ein.
                        Rechtsklick löscht eine Zeichnung.</span
                    ><span class="hidden pointer-coarse:inline"
                        >Ein Finger misst oder zeichnet, zwei verschieben und zoomen
                        die Karte. Lange drücken löscht eine Zeichnung.</span
                    >
                </p>
                <div class="grid grid-cols-2 gap-1">
                    <button
                        class="btn btn-sm {gameState.dm ? '' : 'col-span-2'}"
                        onclick={() =>
                            appState.ws?.send(
                                DeleteDrawings.create({
                                    owner: gameState.name,
                                }),
                            )}>Meine löschen</button
                    >
                    {#if gameState.dm}
                        <button
                            class="btn btn-sm btn-error btn-soft"
                            onclick={() =>
                                appState.ws?.send(DeleteDrawings.create({}))}
                            >Alle löschen</button
                        >
                    {/if}
                </div>
            </div>
        </div>
    </div>
</div>
