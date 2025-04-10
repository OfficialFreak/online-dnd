<script lang="ts">
    import { goto } from "$app/navigation";
    import { onDestroy } from "svelte";
    import { gameState, appState } from "../state.svelte";
    import { connect } from "../connection.svelte";
    import { RollResult } from "$lib/types/messaging/client_messages";
    import DiceRoller from "$lib/components/DiceRoller.svelte";
    import { load } from "@tauri-apps/plugin-store";
    import Map from "$lib/components/Map.svelte";
    import DiceChooser from "$lib/components/DiceChooser.svelte";
    import BlurredBackground from "$lib/components/BlurredBackground.svelte";

    let roller: DiceRoller | null = $state(null);
    let url: string | null = $derived(appState.token ? `${appState.secure ? 'wss://' : 'ws://'}${appState.base_url}/ws?key=${encodeURIComponent(appState.token)}` : null);

    onDestroy(() => {
        if (appState.ws) {
            appState.ws.disconnect();
        }
    });

    $effect(() => {
        if (!appState.ws && appState.store) {
            appState.store.get('token').then((tmp_token) => {
                if (!tmp_token) {
                    goto("/");
                    return;
                }
                appState.token = (tmp_token as {value: string}).value;
                connect(url as string).then((val) => {
                    if (!val) {
                        return;
                    }
                })
            });
        } else if (!appState.store) {
            load('store.json', { autoSave: false }).then((store) => {
                appState.store = store
            });
        }
    });

    async function roll(dice: string[], privacy_level: string) {
        if (!roller) return;
        let result = await roller.roll(dice);
        if (appState.ws && privacy_level !== "private") {
            await appState.ws.send(RollResult.create(result.dice_values, result.roll_result, result.single_roll, privacy_level === "dm"));
        }
    }
</script>

{#if gameState.scene}
{#if gameState.scene.background}
    <BlurredBackground file={gameState.scene.background} blur={gameState.scene.background_blur} />
{/if}
<Map 
    file={gameState.scene.map} 
    columns={gameState.scene.columns} 
    x_offset={gameState.scene.x_offset} 
    y_offset={gameState.scene.y_offset} 
    fog_squares={gameState.scene.state.fog_squares[gameState.name] as [number, number][]}
/>
{/if}
<div class="fixed bottom-2 left-2 z-10">
    <DiceChooser roll_callback={roll} />
</div>
<DiceRoller bind:this={roller} />