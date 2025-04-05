<script lang="ts">
    import { goto } from "$app/navigation";
    import { onDestroy } from "svelte";
    import { gameState, appState } from "../state.svelte";
    import { connect } from "../connection.svelte";
    import { parseServerMessage, type ServerMessage } from "$lib/types/messaging/server_messages";
    import { ActivateScene, InitialMessage, PlayerMessage, PutScene, RollResult } from "$lib/types/messaging/client_messages";
    import DiceRoller from "$lib/components/DiceRoller.svelte";
    import { load } from "@tauri-apps/plugin-store";
    import Map from "$lib/components/Map.svelte";

    let custom_text = $state("");
    let scene_name = $state("");
    let privacy_level = $state("public");
    let messages: ServerMessage[] = $state([]);
    let roller: DiceRoller | null = $state(null);
    let url: string | null = $derived(appState.token ? `ws://${appState.base_url}/ws?key=${encodeURIComponent(appState.token)}` : null);

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

    $effect(() => {
        if (appState.ws) {
            appState.ws.addListener((msg) => {
                if (msg.type == "Text") {
                    let message = parseServerMessage(msg.data)
                    messages.push(message);
                    switch (message.type) {
                        case "message":
                            break;
                        case "initial":
                            gameState.name = message.display_name;
                            gameState.dm = message.dm_status;
                            break;
                        case "event":
                            switch (message.event_type) {
                                case 'joined':
                                    break;
                                case 'left':
                                    break;
                            }
                            break;
                        case "scene":
                            gameState.scene = message;
                            break;
                    }
                }
            });
            // Request initial
            appState.ws.send(InitialMessage.create());
        }
    });

    async function sendMsg() {
        if (appState.ws) {
            await appState.ws.send(PlayerMessage.create(custom_text));
        }
    }
    
    async function roll() {
        if (!roller) return;
        let result = await roller.roll(["1d20"]);
        if (appState.ws && privacy_level !== "private") {
            await appState.ws.send(RollResult.create(result.dice_values, result.roll_result, result.single_roll, privacy_level === "dm"));
        }
    }

    async function save_scene() {
        if (appState.ws) {
            await appState.ws.send(PutScene.create(scene_name, "goblin_door.jpg", 18, 0, 0));
        }
    }

    async function activate_scene() {
        if (appState.ws) {
            await appState.ws.send(ActivateScene.create(scene_name));
        }   
    }
</script>

{#if gameState.scene}
<Map file={gameState.scene.map} columns={gameState.scene.columns} x_offset={gameState.scene.x_offset} y_offset={gameState.scene.y_offset} />
{/if}
<DiceRoller bind:this={roller} rolls={["1d20"]} />

Messages received:<br>
{@html messages.map((msg) => JSON.stringify(msg)).join("<br>")}
<input class="input" type="text" bind:value={custom_text}>
<button class="btn" onclick={sendMsg}>Send</button>
<button class="btn" onclick={roll}>Reroll</button>
<input type="text" placeholder="Scene Name" class="input" bind:value={scene_name}/>
<button class="btn" onclick={save_scene}>Save Scene</button>
<button class="btn" onclick={activate_scene}>Activate Scene</button>

Name: {gameState.name}
DM: {gameState.dm}

<select class="select" bind:value={privacy_level}>
    <option disabled selected>Privacy Level</option>
    <option value="public">Public</option>
    <option value="dm">DM Only</option>
    <option value="private">Private</option>
</select>