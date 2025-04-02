<script>
// @ts-nocheck

    let { children } = $props();
    import "../app.css";

    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { gameState, appState } from "./state.svelte";
    import { connect } from "./connection.svelte";

    const appWindow = getCurrentWindow();
    let token = $state();
    let url = $derived(`ws://${appState.base_url}/ws?key=${encodeURIComponent(token)}`);

    async function reconnect() {
        const tmp_token = await appState.store.get('token')
        if (tmp_token) {
            token = tmp_token.value;
            await connect(url);
        }
    }

    $effect(() => {
        if (appState.ws) {
            // @ts-ignore
            appState.ws.addListener((msg) => {
                console.log(msg);
                // Assume the worst, kill ourselves xD
                if (typeof msg === "string") {
                    console.log("Closed connection :o")
                    appState.ws = null;
                } else if (msg.type == "Close") {
                    console.log("Closed connection :o")
                    appState.ws = null;
                }
            })
        }
    });
</script>
<div data-tauri-drag-region class="titlebar z-10">
    <div>
        <button onclick={reconnect} aria-label="Reconnect" class="cursor-pointer">
            <div class="h-[30px] w-[30px] flex justify-center items-center">
                {#if appState.ws}
                    <div aria-label="success" class="status status-success"></div>
                {:else}
                    <div class="inline-grid *:[grid-area:1/1]">
                        <div class="status status-error animate-ping"></div>
                        <div class="status status-error"></div>
                    </div>
                {/if}
            </div>
        </button>
        {#if gameState.dm}
        <div class="dropdown">
            <div tabindex="0" role="button" class="btn btn-soft btn-info !text-xs px-2 my-auto h-6">DM</div>
            <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
                <li><a href="https://google.com">Do some cool shit</a></li>
                <li><a href="https://google.com">Do some even cooler shit</a></li>
            </ul>
        </div>
        {/if}
    </div>

    <div>
        <button class="titlebar-button" id="titlebar-minimize" onclick={appWindow.minimize} aria-label="Minimize">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13H5v-2h14z"/></svg>
        </button>
        <button class="titlebar-button" id="titlebar-maximize" onclick={appWindow.toggleMaximize} aria-label="Maximize">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m0 2v14H5V5z"/></svg>
        </button>
        <button class="titlebar-button" id="titlebar-close" onclick={appWindow.close} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"/></svg>
        </button>
</div>
</div>
{@render children()}

<style>
    :global(html), :global(body) {
        overscroll-behavior: none;
    }
    .titlebar {
        height: 30px;
        background: var(--root-bg, var(--color-base-100));
        user-select: none;
        display: flex;
        justify-content: space-between;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
    }
    .titlebar-button {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        width: 30px;
        height: 30px;
        user-select: none;
        -webkit-user-select: none;
        color: white;
    }
    .titlebar-button:hover {
        background: var(--root-bg, var(--color-base-200));
    }

    :global(body) {
        margin-top: 30px;
    }
</style>