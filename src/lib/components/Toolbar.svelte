<script lang="ts">
    import { fade } from "svelte/transition";
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
        set_controls_open,
        place_party,
        reset_round,
        record_undo,
        undo,
        redo,
        undoState,
        selection,
        remove_markers,
        drawState,
        wallState,
    } from "../state.svelte";
    import { DRAWING_COLORS, DRAWING_KINDS } from "$lib/drawings";
    import { LIGHT_PRESETS, LIGHTING_LABELS, type Lighting } from "$lib/lighting";
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
        SetVision,
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

    // The menus beside the controls open and close with their button, and close with a
    // click or tap next to them. Opened on hover they couldn't be closed with the button,
    // and Safari keeps the focus that would otherwise close them.
    let touch = $state(false);
    type Menu = "fog" | "measure" | "walls" | "view";
    let open_menu: Menu | null = $state(null);

    function menu_state(menu: Menu) {
        return open_menu === menu ? "dropdown-open" : "dropdown-close";
    }

    function toggle_menu(menu: Menu) {
        open_menu = open_menu === menu ? null : menu;
    }

    /**
     * A tool from a menu, picking the active one again puts it away. On touch screens the
     * menu closes, the map is under it.
     */
    function pick_tool(tool: Tools, active = appState.selectedTool === tool) {
        appState.selectedTool = active ? Tools.None : tool;
        if (touch) open_menu = null;
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

    // The ruler, drawing and the eraser share a button, which shows the one used last
    let measuring = $derived(
        appState.selectedTool === Tools.Ruler ||
            appState.selectedTool === Tools.Draw ||
            appState.selectedTool === Tools.Erase,
    );
    let last_measure_tool = $state(Tools.Ruler);
    $effect(() => {
        if (measuring) last_measure_tool = appState.selectedTool;
    });
    let measure_icon = $derived(
        last_measure_tool === Tools.Ruler
            ? "fa-ruler"
            : last_measure_tool === Tools.Erase
              ? "fa-eraser"
              : (DRAWING_KINDS.find((entry) => entry.kind === drawState.kind)?.icon ??
                "fa-pen-ruler"),
    );

    function pick_drawing(kind: (typeof DRAWING_KINDS)[number]["kind"]) {
        const active = appState.selectedTool === Tools.Draw && drawState.kind === kind;
        drawState.kind = kind;
        pick_tool(Tools.Draw, active);
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
                open_menu = null;
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
            case "KeyE":
                selectTool(Tools.Erase);
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

    const WALL_MODES = [
        { mode: "wall", label: "Wand", icon: "fa-pen" },
        { mode: "door", label: "Tür", icon: "fa-door-closed" },
        { mode: "light", label: "Licht", icon: "fa-lightbulb" },
        { mode: "erase", label: "Löschen", icon: "fa-eraser" },
    ] as const;

    function set_lighting(lighting: Lighting) {
        if (!gameState.scene) return;
        record_undo();
        gameState.scene.state.lighting = lighting;
        appState.ws?.send(SetVision.create({ lighting }));
    }

    /** A mode of the wall tool, picking the active one again puts the tool away */
    function pick_wall_mode(mode: (typeof WALL_MODES)[number]["mode"]) {
        const active = appState.selectedTool === Tools.Walls && wallState.mode === mode;
        wallState.mode = mode;
        pick_tool(Tools.Walls, active);
    }

    function set_vision(enabled: boolean) {
        if (!gameState.scene) return;
        record_undo();
        gameState.scene.state.vision = enabled;
        appState.ws?.send(SetVision.create({ enabled }));
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

    // A panel opened by a shortcut or elsewhere brings the folded away controls back, the
    // characters are there with them folded too
    $effect(() => {
        if (
            toolbarState.panel &&
            toolbarState.panel !== "characters" &&
            !appState.controls_open
        ) {
            set_controls_open(true);
        }
    });

    /** The panel on the page, also while it slides out of sight after closing */
    let shown_panel: typeof toolbarState.panel = $state(null);
    /** Standing still the panel is frosted glass, sliding the glass cost every frame */
    let panel_settled = $state(false);
    let panel_timer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
        const panel = toolbarState.panel;
        if (panel) shown_panel = panel;
        panel_settled = false;
        clearTimeout(panel_timer);
        if (panel) panel_timer = setTimeout(() => (panel_settled = true), 220);
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

{#if appState.controls_open}
<div
    class="gui fixed top-[calc(var(--titlebar)+0.625rem+var(--safe-top))] left-[calc(0.5rem+var(--safe-left))] bottom-[calc(var(--corner-bottom)+3.5rem)] flex flex-row pointer-events-none"
>
    <!-- Once opened a panel stays on the page and only slides out of sight. Built anew each
         time it took a frame of 50 ms, and sliding moves it on the graphics card alone. -->
    {#if shown_panel}
        <div class="h-full mr-1 shrink-0 w-[min(24rem,calc(100vw-4rem))]">
        <!-- Out of the way while a marker or scene is dragged from it onto the map. Only
             transparent, not closed or hidden: that would end the drag. -->
        <div
            class="panel relative h-full w-full rounded-box frosted pointer-events-auto overflow-y-auto overscroll-contain flex flex-col *:shrink-0 {fileDropState.over &&
            fileDropState.over === toolbarState.panel
                ? 'ring-4 ring-info'
                : ''} {dragState.payload
                ? 'opacity-0 !pointer-events-none -translate-x-8'
                : ''} {toolbarState.panel ? '' : 'panel-closed'} {panel_settled
                ? ''
                : 'moving'}"
            inert={!toolbarState.panel}
            data-keep-clear={toolbarState.panel ? "" : undefined}
            bind:this={scroll_container}
            data-file-drop={toolbarState.panel}
        >
            {#if shown_panel === "markers"}
                <MarkerPanel />
            {:else if shown_panel === "scenes"}
                <ScenePanel />
            {:else if shown_panel === "rolls"}
                <RollLog />
            {:else if shown_panel === "sounds"}
                <SoundPanel />
            {:else if !toolbarState.characterOpen}
                <div class="p-2 px-4">
                    <h1 class="text-3xl font-bold">Charaktere</h1>
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
        </div>
    {/if}

    <!-- Two columns where one doesn't fit, like on a phone held sideways. Beside a panel
         slid out of sight it moves into its place. Menus open beside it and the open
         panel, not beside the room the closed panel keeps. -->
    <div
        data-keep-clear
        class="tools flex flex-col gap-0.5 p-1 frosted rounded-box h-min pointer-events-auto [@media(max-height:600px)]:grid [@media(max-height:600px)]:grid-cols-2 {shown_panel &&
        !toolbarState.panel
            ? 'tools-tucked'
            : ''}"
        transition:fade|global={{ duration: 100 }}
    >
        {#if appState.controls_open}
        <!-- Using the map: pointing, measuring and drawing, choosing markers -->
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
        <!-- Drawings are measurements that stay, so they share the ruler's button -->
        <div
            class="dropdown dropdown-right {menu_state('measure')}"
            data-menu="measure"
        >
            <button
                class="btn btn-square btn-sm rounded-box {measuring
                    ? 'btn-info'
                    : open_menu === 'measure'
                      ? 'btn-active'
                      : ''}"
                aria-label="Messen und Zeichnen"
                aria-expanded={open_menu === "measure"}
                title="Messen und Zeichnen"
                onclick={() => toggle_menu("measure")}
                ><i class="fa-solid {measure_icon}"></i></button
            >
            <div
                class="dropdown-content bg-base-100 rounded-box z-1 p-2 shadow-sm flex flex-col gap-2"
                style="transform: translate(var(--shift-x, 0px), var(--shift-y, 0px))"
                use:keep_in_view
            >
                <div class="flex flex-row items-center gap-0.5">
                    <button
                        class="btn btn-sm btn-square {appState.selectedTool ===
                        Tools.Ruler
                            ? 'btn-info'
                            : 'btn-ghost'}"
                        title="Lineal (L)"
                        aria-label="Lineal"
                        onclick={() => pick_tool(Tools.Ruler)}
                    >
                        <i class="fa-solid fa-ruler"></i>
                    </button>
                    <span class="w-px h-5 bg-base-content/15 mx-1"></span>
                    {#each DRAWING_KINDS as { kind, label, icon }}
                        <button
                            class="btn btn-sm btn-square {appState.selectedTool ===
                                Tools.Draw && drawState.kind === kind
                                ? 'btn-info'
                                : 'btn-ghost'}"
                            title={label}
                            aria-label={label}
                            onclick={() => pick_drawing(kind)}
                        >
                            <i class="fa-solid {icon}"></i>
                        </button>
                    {/each}
                    <span class="w-px h-5 bg-base-content/15 mx-1"></span>
                    <button
                        class="btn btn-sm btn-square {appState.selectedTool ===
                        Tools.Erase
                            ? 'btn-info'
                            : 'btn-ghost'}"
                        title="Radierer (E)"
                        aria-label="Radierer"
                        onclick={() => pick_tool(Tools.Erase)}
                    >
                        <i class="fa-solid fa-eraser"></i>
                    </button>
                </div>
                <div class="flex flex-row items-center gap-1.5 px-1">
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
                    <span class="flex-1"></span>
                    <button
                        class="btn btn-xs btn-square {drawState.snap
                            ? 'btn-info'
                            : 'btn-ghost'}"
                        title="Am Raster einrasten"
                        aria-label="Am Raster einrasten"
                        aria-pressed={drawState.snap}
                        onclick={() => (drawState.snap = !drawState.snap)}
                    >
                        <i class="fa-solid fa-border-all"></i>
                    </button>
                </div>
                <div class="flex flex-row gap-1 border-t border-base-content/10 pt-2">
                    <button
                        class="btn btn-xs btn-ghost flex-1"
                        onclick={() =>
                            appState.ws?.send(
                                DeleteDrawings.create({
                                    owner: gameState.name,
                                }),
                            )}
                        ><i class="fa-solid fa-trash-can"></i> Meine löschen</button
                    >
                    {#if gameState.dm}
                        <button
                            class="btn btn-xs btn-ghost text-error flex-1"
                            onclick={() =>
                                appState.ws?.send(DeleteDrawings.create({}))}
                            ><i class="fa-solid fa-trash-can"></i> Alle löschen</button
                        >
                    {/if}
                </div>
            </div>
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
        {/if}
        <span class="tool-divider" aria-hidden="true"></span>
        {/if}
        <!-- Panels -->
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
        {#if appState.controls_open}
        {#if gameState.dm}
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
                    Musik und Wetter <kbd class="kbd">B</kbd>
                </div>
                <button
                    tabindex="0"
                    class="btn btn-square btn-sm rounded-box {toolbarState.panel ===
                    'sounds'
                        ? 'btn-info'
                        : ''}"
                    aria-label="Musik und Wetter"
                    onclick={() => togglePanel("sounds")}
                >
                    <i class="fa-solid fa-music"></i>
                </button>
            </div>
        {/if}
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
        {#if gameState.dm}
            <span class="tool-divider" aria-hidden="true"></span>
            <!-- What the players see -->
            <div
                class="dropdown dropdown-right {menu_state('view')}"
                data-menu="view"
            >
                <!-- Without tabindex: daisyUI makes the button of an open menu unclickable -->
                <button
                    class="btn btn-square btn-sm rounded-box {fogState.selected_player !==
                    'all'
                        ? 'btn-info'
                        : open_menu === 'view'
                          ? 'btn-active'
                          : ''}"
                    aria-label="Ansicht eines Spielers"
                    aria-expanded={open_menu === "view"}
                    title="Ansicht"
                    onclick={() => toggle_menu("view")}
                    ><i class="fa-solid fa-eye"></i></button
                >
                <div
                    class="dropdown-content bg-base-100 rounded-box z-1 w-60 p-2 shadow-sm flex flex-col gap-2"
                    style="transform: translate(var(--shift-x, 0px), var(--shift-y, 0px))"
                    use:keep_in_view
                >
                    <!-- Buttons, not a select: its list opens outside the page, the menu
                         lost the mouse there and closed -->
                    <div class="flex flex-wrap gap-1">
                        <button
                            class="btn btn-xs {fogState.selected_player === 'all'
                                ? 'btn-info'
                                : ''}"
                            title="Du siehst alles, Nebel malst du für alle"
                            onclick={() => (fogState.selected_player = "all")}
                            >Alles (DM)</button
                        >
                        {#each gameState.users.filter((user) => !user.dm) as player (player.name)}
                            <button
                                class="btn btn-xs {fogState.selected_player ===
                                player.name
                                    ? 'btn-info'
                                    : ''}"
                                title={player.active ? "Online" : "Offline"}
                                onclick={() => (fogState.selected_player = player.name)}
                            >
                                <span
                                    class="w-1.5 h-1.5 rounded-full {player.active
                                        ? 'bg-success'
                                        : 'bg-error'}"
                                ></span>
                                {player.name}
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
            <div
                class="dropdown dropdown-right {menu_state('fog')}"
                data-menu="fog"
            >
                <button
                    class="btn btn-square btn-sm rounded-box {fog_active
                        ? 'btn-info'
                        : open_menu === 'fog'
                          ? 'btn-active'
                          : ''}"
                    aria-label="Nebel"
                    aria-expanded={open_menu === "fog"}
                    title="Nebel"
                    onclick={() => toggle_menu("fog")}
                    ><i class="fa-solid fa-cloud"></i></button
                >
                <div
                    class="dropdown-content bg-base-100 rounded-box z-1 w-56 p-2 shadow-sm flex flex-col gap-2"
                    style="transform: translate(var(--shift-x, 0px), var(--shift-y, 0px))"
                    use:keep_in_view
                >
                    {#if fogState.selected_player !== "all"}
                        <span class="badge badge-sm badge-info badge-soft self-start">
                            <i class="fa-solid fa-eye"></i>
                            {fogState.selected_player}
                        </span>
                    {/if}
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
                                onclick={() => pick_tool(Tools.AddFog)}
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
                                onclick={() => pick_tool(Tools.RemoveFog)}
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
            <div
                class="dropdown dropdown-right {menu_state('walls')}"
                data-menu="walls"
            >
                <button
                    class="btn btn-square btn-sm rounded-box {appState.selectedTool ===
                    Tools.Walls
                        ? 'btn-info'
                        : open_menu === 'walls'
                          ? 'btn-active'
                          : ''}"
                    aria-label="Wände und Sicht"
                    aria-expanded={open_menu === "walls"}
                    title="Wände und Sicht"
                    onclick={() => toggle_menu("walls")}
                    ><i class="fa-solid fa-dungeon"></i></button
                >
                <div
                    class="dropdown-content bg-base-100 rounded-box z-1 w-64 p-2 shadow-sm flex flex-col gap-2"
                    style="transform: translate(var(--shift-x, 0px), var(--shift-y, 0px))"
                    use:keep_in_view
                >
                    <label class="flex items-start gap-2 text-sm">
                        <input
                            type="checkbox"
                            class="toggle toggle-sm mt-0.5"
                            checked={!!gameState.scene?.state.vision}
                            disabled={!gameState.scene}
                            onchange={(event) =>
                                set_vision(event.currentTarget.checked)}
                        />
                        Spieler sehen nur, was ihre Figuren sehen
                    </label>
                    <fieldset class="fieldset p-0">
                        <legend class="fieldset-legend pt-0">Helligkeit ohne Lichter</legend>
                        <div class="join w-full">
                            {#each Object.entries(LIGHTING_LABELS) as [lighting, label] (lighting)}
                                <button
                                    class="btn btn-sm join-item flex-1 {(gameState.scene?.state
                                        .lighting ?? 'bright') === lighting
                                        ? 'btn-info'
                                        : ''}"
                                    disabled={!gameState.scene}
                                    onclick={() => set_lighting(lighting as Lighting)}
                                    >{label}</button
                                >
                            {/each}
                        </div>
                    </fieldset>
                    <div class="grid grid-cols-2 gap-1">
                        {#each WALL_MODES as { mode, label, icon } (mode)}
                            <button
                                class="btn btn-sm px-1 {appState.selectedTool ===
                                    Tools.Walls && wallState.mode === mode
                                    ? 'btn-info'
                                    : ''}"
                                onclick={() => pick_wall_mode(mode)}
                            >
                                <i class="fa-solid {icon}"></i>
                                {label}
                            </button>
                        {/each}
                    </div>
                    {#if wallState.mode === "light"}
                        <div class="flex flex-wrap gap-1" aria-label="Neues Licht">
                            {#each LIGHT_PRESETS as preset (preset.key)}
                                <button
                                    class="btn btn-xs {wallState.light === preset.key
                                        ? 'btn-info'
                                        : ''}"
                                    title="{preset.bright} ft hell, {preset.dim} ft dämmrig"
                                    onclick={() => (wallState.light = preset.key)}
                                >
                                    <span
                                        class="w-2 h-2 rounded-full"
                                        style="background: {preset.color}"
                                    ></span>
                                    {preset.label}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
            <span class="tool-divider" aria-hidden="true"></span>
            <!-- The game -->
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
        {/if}
        {/if}
    </div>
</div>
{/if}

<style>
    /* The controls stay in the background: no ground of their own for the buttons, muted
       until pointed at, the active one tinted instead of filled */
    .tools {
        background: color-mix(in srgb, var(--color-base-100), transparent 55%);
        border-color: transparent;
        box-shadow: none;
    }
    @supports (-moz-appearance: none) {
        .tools {
            background: color-mix(in srgb, var(--color-base-100), transparent 15%);
        }
    }
    .tools > div > .btn {
        background: transparent;
        border-color: transparent;
        box-shadow: none;
        color: color-mix(in srgb, var(--color-base-content), transparent 35%);
    }
    .tools > div > .btn:hover:not(:disabled),
    .tools > div > .btn.btn-active {
        background: color-mix(in srgb, var(--color-base-content), transparent 88%);
        color: var(--color-base-content);
    }
    .tools > div > .btn.btn-info {
        background: color-mix(in srgb, var(--color-info), transparent 78%);
        color: var(--color-info);
    }
    .tools > div > .btn:disabled {
        background: transparent;
        opacity: 0.35;
    }
    .tool-divider {
        height: 1px;
        margin: 0.2rem 0.4rem;
        background: color-mix(in srgb, var(--color-base-content), transparent 88%);
    }
    /* Two columns on a low screen, the line across both */
    @media (max-height: 600px) {
        .tool-divider {
            grid-column: span 2;
        }
    }
    /* Sliding only moves and fades it, which the graphics card does alone */
    .panel {
        transition:
            translate 200ms ease-out,
            opacity 200ms ease-out,
            box-shadow 150ms,
            visibility 0s;
    }

    .panel-closed {
        translate: -50px 0;
        opacity: 0;
        visibility: hidden;
        transition:
            translate 200ms ease-in,
            opacity 200ms ease-in,
            visibility 0s 200ms;
    }

    /* Frosted glass while it slides was redrawn behind it every frame */
    .panel.moving {
        backdrop-filter: none;
        background: color-mix(in srgb, var(--color-base-100), transparent 8%);
    }

    .tools {
        transition: translate 200ms ease-out;
    }

    .tools-tucked {
        translate: calc(-1 * (min(24rem, 100vw - 4rem) + 0.25rem)) 0;
    }
</style>
