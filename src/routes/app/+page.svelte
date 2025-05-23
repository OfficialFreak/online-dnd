<script lang="ts">
    import { goto } from "$app/navigation";
    import { onDestroy } from "svelte";
    import {
        gameState,
        appState,
        fogState,
        Tools,
        roller,
    } from "../../lib/state.svelte";
    import { connect } from "../../lib/connection.svelte";
    import { RollResult } from "$lib/types/messaging/client_messages";
    import DiceRoller from "$lib/components/DiceRoller.svelte";
    import { load } from "@tauri-apps/plugin-store";
    import Map from "$lib/components/Map.svelte";
    import DiceChooser from "$lib/components/DiceChooser.svelte";
    import BlurredBackground from "$lib/components/BlurredBackground.svelte";
    import Toolbar from "$lib/components/Toolbar.svelte";
    import { MessageTypes, notify } from "../../lib/notifications.svelte";

    let url: string | null = $derived(
        appState.token
            ? `${appState.secure ? "wss://" : "ws://"}${appState.baseUrl}/ws?key=${encodeURIComponent(appState.token)}`
            : null,
    );

    onDestroy(() => {
        if (appState.ws) {
            appState.ws.disconnect();
        }
    });

    $effect(() => {
        if (!appState.ws && appState.store && appState.token) {
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
        } else if (!appState.store) {
            load("store.json", { autoSave: false }).then((store) => {
                appState.store = store;
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
                    });
            });
        }
    });

    async function roll(dice: string[], privacy_level: string) {
        if (!roller.value) return;
        let result = await roller.value(dice, 0);
        if (appState.ws && privacy_level !== "private") {
            await appState.ws.send(
                RollResult.create(
                    result.dice_values,
                    result.roll_result,
                    result.single_roll,
                    privacy_level === "dm",
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
        ] as [number, number][]}
        markers={gameState.scene.state.markers}
        editable={true}
    />
{/if}
{#if !appState.dragging}
    <div class="fixed top-10 left-2 bottom-16 pointer-events-none">
        <Toolbar />
    </div>
    <div class="fixed bottom-2 left-2 z-10">
        <DiceChooser roll_callback={roll} />
    </div>
{/if}
<DiceRoller />
