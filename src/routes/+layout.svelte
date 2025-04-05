<script lang="ts">
    let { children } = $props();
    import "../app.css";

    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { gameState, appState, ensureStore } from "./state.svelte";
    import { connect } from "./connection.svelte";
    import { load, Store } from "@tauri-apps/plugin-store";
    import { open } from "@tauri-apps/plugin-dialog";
    import { readFile } from "@tauri-apps/plugin-fs";
    import { fetch } from "@tauri-apps/plugin-http";
    import { onMount } from "svelte";

    const appWindow = getCurrentWindow();
    let url = $derived(appState.token ? `ws://${appState.base_url}/ws?key=${encodeURIComponent(appState.token)}` : null);

    async function upload_file(selectedFilePath: string, selectedFileName: string) {
        if (!selectedFilePath || !appState.token) {
            // TODO: Notification -> please select a file
            throw new Error(`Upload failed: no file selected`);
        }
        
        // Read the file as binary
        const fileContent = await readFile(selectedFilePath);
        
        // Create form data using Tauri's HTTP client
        const formData = new FormData();
        const blob = new Blob([fileContent]);
        formData.append('file', blob, selectedFileName);
        
        // Make the request using Tauri's fetch
        const response = await fetch(`${appState.http_protocol}${appState.base_url}/assets?key=${encodeURIComponent(appState.token)}`, {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }
    }

    async function user_upload() {
        // Open file dialog and get selected file path
        const selected = await open({
            multiple: false,
            filters: [
            { name: 'All Files', extensions: ['*'] }
            // You can add specific filters if needed:
            // { name: 'Images', extensions: ['png', 'jpg'] }
            ]
        });
        
        if (selected === null) {
            // User canceled the selection
            throw new Error(`Upload failed: no file selected`);
        }
        
        let selectedFilePath = selected;
        
        // Extract file name from path
        let selectedFileName = selectedFilePath.split(/[/\\]/).pop();
        if (!selectedFileName) {
            throw new Error("Invalid file name");
        }

        await upload_file(selectedFilePath, selectedFileName);
    }

    async function reconnect() {
        if (!url) return;
        await connect(url);
    }

    $effect(() => {
        if (appState.ws) {
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

    onMount(async () => {
        await ensureStore();
        appState.store = appState.store as Store;
        appState.token = ((await appState.store.get('token')) as {value: string}).value as string;
    })
</script>
<div data-tauri-drag-region class="titlebar transition-opacity z-10">
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
                <li><button class="btn btn-ghost" onclick={user_upload}>Datei hochladen</button></li>
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
    :global(:root:has( .modal-open, .modal[open], .modal:target, .modal-toggle:checked, .drawer:not(.drawer-open) > .drawer-toggle:checked ) .titlebar) {
        opacity: 0;
    }
    .titlebar {
        height: 30px;
        user-select: none;
        display: flex;
        justify-content: space-between;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: rgba(28, 34, 41, 0.59);
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(7.5px);
        -webkit-backdrop-filter: blur(7.5px);
        border: 1px solid rgba(28, 34, 41, 0.12);
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