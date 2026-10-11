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
    } from "../../lib/state.svelte";
    import { MessageType } from "$lib/types/messaging/server_messages";
    import { shared_roll } from "$lib/rolls";
    import { connect } from "../../lib/connection.svelte";
    import { RollResult } from "$lib/types/messaging/client_messages";
    import DiceRoller from "$lib/components/DiceRoller.svelte";
    import { load } from "@tauri-apps/plugin-store";
    import Map from "$lib/components/Map.svelte";
    import DiceChooser from "$lib/components/DiceChooser.svelte";
    import BlurredBackground from "$lib/components/BlurredBackground.svelte";
    import Toolbar from "$lib/components/Toolbar.svelte";
    import { MessageTypes, notify } from "../../lib/notifications.svelte";
    import InitiativeBar from "$lib/components/InitiativeBar.svelte";
    import { fade } from "svelte/transition";
    import StatusEffectBar from "$lib/components/StatusEffectBar.svelte";
    import DragGhost from "$lib/components/DragGhost.svelte";

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
            .then((tmp_token: { value: string } | null) => {
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
                load("store.json", { autoSave: false }).then((store) => {
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
            (appState.selectedTool === Tools.AddFog ||
                appState.selectedTool === Tools.RemoveFog) &&
            fogState.selected_player != "all"
                ? fogState.selected_player
                : gameState.name
        ]}
        markers={gameState.scene.state.markers}
        editable={true}
    />
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
<!-- Hidden instead of unmounted while dragging a marker, so tools keep their state -->
<div
    class="contents"
    style:visibility={appState.dragging ? "hidden" : null}
>
    {#if gameState.scene && gameState.combat}
        <div
            class="fixed top-[1.85rem] left-0 ml-14 w-[calc(100vw-5rem)] overflow-x-auto overflow-y-hidden flex justify-center pointer-events-none"
        >
            <InitiativeBar />
        </div>
    {/if}
    <Toolbar />
    <div class="fixed bottom-2 left-2 z-10">
        <DiceChooser roll_callback={roll} />
    </div>

    <div
        class="fixed bottom-0 left-0 w-screen z-[999] overflow-hidden scrollbar-gutter-affected flex justify-end pointer-events-none"
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
        <div class="fixed bottom-2 left-1/2 -translate-x-1/2 z-10">
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
