<script lang="ts">
    import { goto } from "$app/navigation";
    import { onDestroy, onMount } from "svelte";
    import {
        gameState,
        appState,
        fogState,
        Tools,
        roller,
        advance_turn,
        get_own_character,
        remember_roll,
        toolbarState,
        selection,
        remove_markers,
    } from "../../lib/state.svelte";
    import { MessageType } from "$lib/types/messaging/server_messages";
    import { shared_roll } from "$lib/rolls";
    import { connect } from "../../lib/connection.svelte";
    import { RollResult } from "$lib/types/messaging/client_messages";
    import DiceRoller from "$lib/components/DiceRoller.svelte";
    import { load_store } from "$lib/platform";
    import Map from "$lib/components/Map.svelte";
    import DiceChooser from "$lib/components/DiceChooser.svelte";
    import BlurredBackground from "$lib/components/BlurredBackground.svelte";
    import Toolbar from "$lib/components/Toolbar.svelte";
    import { MessageTypes, notify } from "../../lib/notifications.svelte";
    import InitiativeBar from "$lib/components/InitiativeBar.svelte";
    import { fade } from "svelte/transition";
    import StatusEffectBar from "$lib/components/StatusEffectBar.svelte";
    import DragGhost from "$lib/components/DragGhost.svelte";
    import WeatherLayer from "$lib/components/WeatherLayer.svelte";
    import ReactionBar from "$lib/components/ReactionBar.svelte";
    import SceneIntro from "$lib/components/SceneIntro.svelte";
    import AmbientLight from "$lib/components/AmbientLight.svelte";

    let url: string | null = $derived(
        appState.token
            ? `${appState.secure ? "wss://" : "ws://"}${appState.baseUrl}/ws?key=${encodeURIComponent(appState.token)}`
            : null,
    );

    onDestroy(() => {
        if (appState.ws) {
            appState.ws.disconnect().catch(() => {});
        }
    });

    function try_connect() {
        appState.store
            .get("token")
            .then((stored) => {
                const tmp_token = stored as { value: string } | undefined;
                if (!tmp_token) {
                    notify(
                        "Keine Zugangsdaten gefunden",
                        MessageTypes.Error,
                        3000,
                    );
                    goto("/");
                    return;
                }
                appState.token = (tmp_token as { value: string }).value;
                connect(url as string).then((val) => {
                    if (!val) {
                        notify(
                            "Verbindung fehlgeschlagen",
                            MessageTypes.Error,
                            3000,
                        );
                        return;
                    } else {
                        notify("Verbunden", MessageTypes.Success, 1000);
                    }
                });
            });
    }

    onMount(() => {
        if (!appState.ws) {
            if (appState.store) {
                try_connect();
            } else {
                load_store().then((store) => {
                    appState.store = store;
                    try_connect();
                });
            }
        }
    });

    async function roll(dice: string[], privacy_level: string) {
        if (!roller.value) return;
        let result = await roller.value(dice, 0);
        // The server doesn't send these back to this client, they go into its history here
        if (
            privacy_level === "private" ||
            (privacy_level === "dm" && !gameState.dm)
        ) {
            remember_roll({
                type: MessageType.ROLL_RESULT,
                sender: get_own_character()?.name ?? gameState.name,
                sender_dm: gameState.dm,
                dices: result.dice_values,
                result: result.roll_result,
                single_dice: result.single_roll,
                dm_only: privacy_level === "dm",
                notation: dice.join(" + "),
                mode: result.mode,
                d20s: result.d20s,
                private: privacy_level === "private",
                local: true,
            });
        }
        if (appState.ws && privacy_level !== "private") {
            await appState.ws.send(
                RollResult.create(
                    result.dice_values,
                    result.roll_result,
                    result.single_roll,
                    privacy_level === "dm",
                    dice.join(" + "),
                    result.mode,
                    result.d20s,
                    shared_roll(result),
                ),
            );
        }
    }
</script>

<!-- Behind everything, also behind the background image -->
<AmbientLight />
{#if gameState.scene}
    {#if gameState.scene.background}
        <BlurredBackground
            file={gameState.scene.background}
            blur={gameState.scene.background_blur}
        />
    {/if}
    <Map
        file={gameState.scene.map}
        columns={gameState.scene.columns}
        x_offset={gameState.scene.x_offset}
        y_offset={gameState.scene.y_offset}
        fog_squares={gameState.scene.state?.fog_squares[
            gameState.dm && fogState.selected_player != "all"
                ? fogState.selected_player
                : gameState.name
        ]}
        markers={gameState.scene.state.markers}
        editable={true}
    />
    <WeatherLayer weather={gameState.scene.weather} />
{:else if appState.ws && gameState.users.length > 0}
    <!-- The server sends the users after the scene, so there is none -->
    <div
        class="fixed inset-0 flex items-center justify-center pointer-events-none"
        in:fade={{ duration: 300 }}
    >
        <div
            class="flex flex-col items-center gap-2 max-w-sm p-6 text-center text-base-content/60"
        >
            <i class="fa-solid fa-map text-4xl mb-2"></i>
            <h2 class="text-xl font-bold text-base-content/80">
                Keine Szene aktiv
            </h2>
            {#if gameState.dm}
                <p>
                    Aktiviere eine Szene oder erstelle eine neue, dann sehen
                    alle sie hier.
                </p>
                <button
                    class="btn btn-sm mt-2 pointer-events-auto"
                    onclick={() => (toolbarState.panel = "scenes")}
                >
                    <i class="fa-solid fa-map"></i> Szenen öffnen
                </button>
            {:else}
                <p>Sobald der DM eine Szene startet, erscheint sie hier.</p>
            {/if}
        </div>
    </div>
{/if}
<!-- Over the map, under the controls -->
<SceneIntro />
<!-- Hidden instead of unmounted while dragging a marker, so tools keep their state -->
<div
    class="contents"
    style:visibility={appState.dragging ? "hidden" : null}
>
    {#if gameState.dm && fogState.selected_player !== "all"}
        <!-- So the DM doesn't forget that the map shows a player's view -->
        <div
            class="gui fixed top-[calc(var(--titlebar)+var(--safe-top)+0.5rem)] right-[calc(1rem+var(--safe-right))] z-10 badge badge-info gap-1 pr-0.5 shadow"
        >
            <i class="fa-solid fa-eye"></i>
            Ansicht von {fogState.selected_player}
            <button
                class="btn btn-ghost btn-xs btn-circle"
                aria-label="Wieder alles sehen"
                title="Wieder alles sehen"
                onclick={() => (fogState.selected_player = "all")}
                ><i class="fa-solid fa-xmark"></i></button
            >
        </div>
    {/if}
    {#if gameState.scene && gameState.combat}
        <div
            class="gui fixed top-[calc(var(--titlebar)+var(--safe-top))] left-[var(--safe-left)] ml-14 w-[calc(100vw-5rem-var(--safe-left)-var(--safe-right))] overflow-x-auto overflow-y-hidden pb-12 flex justify-center pointer-events-none"
        >
            <InitiativeBar />
        </div>
    {/if}
    <Toolbar />
    <!-- Above the conditions on the right, the dice reach there on phones. Wrapped from
         the bottom up, so items-start keeps the buttons at the bottom: with items-end the
         dice rose to the top when the reactions' menu took two lines. -->
    <div
        class="gui fixed bottom-[calc(0.5rem+var(--safe-bottom))] left-[calc(0.5rem+var(--safe-left))] z-[1000] flex flex-wrap-reverse items-start gap-1 max-w-[calc(100vw-1rem-var(--safe-left))]"
    >
        <DiceChooser roll_callback={roll} />
        <ReactionBar />
    </div>

    <!-- What can be done with the selected markers, without Delete key on a tablet -->
    {#if gameState.dm && selection.size > 0}
        <div
            class="gui fixed bottom-[calc(3.5rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 z-10 frosted rounded-box p-1 pl-3 flex flex-row items-center gap-2"
            transition:fade={{ duration: 150 }}
        >
            <span
                class="text-sm whitespace-nowrap"
                title="Zieh einen von ihnen, um alle zu verschieben"
                >{selection.size} Marker ausgewählt</span
            >
            <button
                class="btn btn-sm btn-soft btn-error"
                onclick={() => remove_markers([...selection])}
            >
                <i class="fa-solid fa-trash"></i> Entfernen
            </button>
            <button
                class="btn btn-sm btn-ghost btn-square"
                aria-label="Auswahl aufheben"
                onclick={() => selection.clear()}
            >
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    {/if}

    <!-- On phones above the turn button, which moves to the right there -->
    <div
        class="gui fixed bottom-[var(--safe-bottom)] max-sm:bottom-[calc(3.5rem+var(--safe-bottom))] left-0 pr-[var(--safe-right)] w-screen z-[999] overflow-hidden scrollbar-gutter-affected flex justify-end pointer-events-none"
    >
        <div
            class="w-80 p-2 pointer-events-none flex flex-col justify-end items-end gap-1"
        >
            {#if get_own_character()?.activeStatusEffects?.length || 0 > 0}
                <div
                    class="flex justify-end items-end pointer-events-auto -mt-4"
                    transition:fade|global={{ duration: 200 }}
                >
                    <div
                        class="max-w-[50vw] overflow-x-auto h-26 px-8 flex justify-start items-end no-scrollbar"
                    >
                        <StatusEffectBar
                            effects={get_own_character().activeStatusEffects}
                        />
                    </div>
                </div>
            {/if}
        </div>
    </div>

    {#if gameState.combat && (gameState.scene?.state.initiative?.length || 0) > 0 && (gameState.dm || get_own_character()?.name === gameState.scene?.state.turn)}
        <!-- On phones the dice take the bottom left, so it goes to the right -->
        <div
            class="gui fixed bottom-[calc(0.5rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 max-sm:left-auto max-sm:right-[calc(0.5rem+var(--safe-right))] max-sm:translate-x-0 z-10"
        >
            <div class="tooltip">
                <div class="tooltip-content">
                    <kbd class="kbd">→</kbd>
                </div>
                <button
                    transition:fade={{ duration: 200 }}
                    class="btn {gameState.dm
                        ? !gameState.characters.some(
                              (character) =>
                                  character.name ===
                                  gameState.scene?.state.turn,
                          )
                            ? 'btn-info'
                            : ''
                        : 'btn-info'}"
                    onclick={advance_turn}
                >
                    <!-- Nobody has the turn until the DM starts the first one -->
                    {gameState.scene?.state.turn
                        ? "Zug beenden"
                        : "Ersten Zug starten"}
                </button>
            </div>
        </div>
    {/if}
</div>
<DiceRoller />
<DragGhost />
