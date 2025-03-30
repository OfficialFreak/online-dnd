<script>
    // @ts-ignore
    import WebSocket from '@tauri-apps/plugin-websocket';
    import { load } from '@tauri-apps/plugin-store';
    import { onMount } from 'svelte';
    import { redirect } from '@sveltejs/kit';
    import { fade } from 'svelte/transition';

    let ws = $state();
    let token = $state("");
    let loading = $state(false);
    let error = $state(false);
    let url = $derived(`ws://dnd.wiegraebe.dev?key=${token}`);
    let store = $state();

    async function connect() {
        loading = true;
        try {
            ws = await WebSocket.connect(url);
            error = false;
            await store.set('token', { value: token });
            await store.save();
            redirect(200, "/app")
        } catch (err) {
            error = true;
        } finally {
            loading = false;
        }
    }

    onMount(async () => {
        store = await load('store.json', { autoSave: false });
        const tmp_token = await store.get('token');
        if (tmp_token) {
            token = tmp_token.value;
            await connect();
        }
    })
</script>

<main class="h-screen flex justify-center items-center flex-col">
    {#if loading}
        <span class="loading loading-infinity w-30"></span>
    {:else}
        <fieldset class="fieldset w-xs bg-base-200 border border-base-300 p-4 rounded-box">
            <legend class="fieldset-legend">Login</legend>
            
            <label class="fieldset-label" for="token">Passwort</label>
            <input type="password" class="input" placeholder="Passwort eingeben" name="token" bind:value={token} />
            
            <button class="btn btn-neutral mt-4" onclick={connect}>Verbinden</button>
        </fieldset>
        <div class="toast toast-end">   
            {#if error}
            <button onclick={() => {error=false}} transition:fade>
                <div role="alert" class="alert alert-error">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Verbindung fehlgeschlagen</span>
                </div>
            </button>
            {/if}
        </div>
    {/if}
</main>
