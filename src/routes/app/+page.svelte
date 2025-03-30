<script>
    import { goto } from "$app/navigation";
    import { onDestroy, onMount } from "svelte";
    import { userState } from "../state.svelte";
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
                    messages.push(JSON.stringify(json_msg));
                }
            });
        }
    });

    async function sendMsg() {
        // @ts-ignore
        if (userState.ws) {
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