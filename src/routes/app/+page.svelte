<script>
    import { goto } from "$app/navigation";
    import { onDestroy, onMount } from "svelte";
    import { gameState, userState } from "../state.svelte";
    import { connect } from "../connection.svelte";

    let token = $state();
    let custom_text = $state("");
    // @ts-ignore
    let messages = $state([]);
    let url = $derived(`ws://${userState.base_url}/ws?key=${encodeURIComponent(token)}`);

    onDestroy(() => {
        if (userState.ws) {
            // @ts-ignore
            userState.ws.disconnect();
        }
    });

    $effect(() => {
        if (!userState.ws) {
            userState.store.get('token').then((tmp_token) => {
                if (!tmp_token) {
                    goto("/");
                    return;
                }
                token = tmp_token.value;
                connect(url).then((val) => {
                    if (!val) {
                        return;
                    }
                })
            });
        }
    });

    $effect(() => {
        if (userState.ws) {
            // @ts-ignore
            userState.ws.addListener((msg) => {
                if (msg.type == "Text") {
                    let json_msg = JSON.parse(msg.data);
                    // TODO: Handle message type etc.
                    switch (json_msg["type"]) {
                        case "message":
                            messages.push(JSON.stringify(json_msg));
                            break;
                        case "event":
                            messages.push(JSON.stringify(json_msg));
                            break;
                        case "initial":
                            gameState.name = json_msg["display_name"];
                            gameState.dm = json_msg["dm_status"];
                            break;
                    }
                }
            });
        }
    });

    async function sendMsg() {
        // @ts-ignore
        if (userState.ws) {
            // @ts-ignore
            await userState.ws.send(JSON.stringify({
                "type": "message",
                "msg": custom_text
            }));
        }
    }
</script>

Messages received:<br>
{@html messages.join("<br>")}
<input class="input" type="text" bind:value={custom_text}>
<button class="btn" onclick={sendMsg}>Send</button>
Name: {gameState.name}
DM: {gameState.dm}