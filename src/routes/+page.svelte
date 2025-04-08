<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { appState, ensureStore } from './state.svelte';
    import { connect } from './connection.svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { load, Store } from '@tauri-apps/plugin-store';

    let token: string = $state("");
    let loading = $state(true);
    let error = $state(false);
    let url = $derived(`${appState.secure ? 'wss://' : 'ws://'}${appState.base_url}/ws?key=${encodeURIComponent(token)}`);

    async function connectLoadingWrapper() {
        await ensureStore();
        appState.store = appState.store as Store;
        loading = true;
        if (await connect(url)) {
            loading = false;
            error = false;
            await appState.store.set('token', { value: token });
            await appState.store.save();
            goto("/app");
        } else {
            error = true;
            loading = false;
        }
    }

    onMount(async () => {
        await ensureStore();
        appState.store = appState.store as Store;
        const tmp_token = await appState.store.get('token');
        if (tmp_token) {
            token = (tmp_token as {value: string}).value;
            await connectLoadingWrapper();
        } else {
            loading = false;
        }
        invoke("close_splashscreen");

    })
</script>

<main class="h-[calc(100vh-30px)] flex justify-center items-center flex-col">
    {#if loading}
        <span class="loading loading-infinity w-30"></span>
    {:else}
        <fieldset class="fieldset w-xs bg-base-200 border border-base-300 p-4 rounded-box">
            <legend class="fieldset-legend">Login</legend>
            
            <label class="fieldset-label" for="token">Passwort</label>
            <input type="password" class="input" placeholder="Passwort eingeben" name="token" bind:value={token} />
            
            <button class="btn btn-neutral mt-4" onclick={connectLoadingWrapper}>Verbinden</button>
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
