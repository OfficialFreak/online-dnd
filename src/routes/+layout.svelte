<script lang="ts">
    let { children } = $props();
    import "../app.css";
    import '@fortawesome/fontawesome-free/css/all.min.css';

    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { gameState, appState, ensureStore, mouseDown, mouseX, mouseY, DMName, showMouse } from "./state.svelte";
    import { connect } from "./connection.svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { readFile } from "@tauri-apps/plugin-fs";
    import { fetch } from "@tauri-apps/plugin-http";
    import { onMount } from "svelte";
    import Map from "$lib/components/Map.svelte";
    import { ActivateScene, DeleteScene, InitialMessage, PreloadResource, PutScene, TogglePressure } from "$lib/types/messaging/client_messages";
    import { parseServerMessage } from "$lib/types/messaging/server_messages";
    import { SvelteMap } from "svelte/reactivity";
    // @ts-ignore
    import confetti from "canvas-confetti";
    import BlurredBackground from "$lib/components/BlurredBackground.svelte";
    import { listen } from "@tauri-apps/api/event";
    import { Tween } from "svelte/motion";
    import { circOut } from "svelte/easing";

    const stopwatch = confetti.shapeFromText({ text: '⏱️', scalar: 8 });
    const time = confetti.shapeFromText({ text: '⌚', scalar: 8 });
    let confetti_canvas: HTMLCanvasElement | null = $state(null)
    let confetti_function: any = $state();

    const appWindow = getCurrentWindow();
    let url = $derived(appState.token ? `${appState.secure ? 'wss://' : 'ws://'}${appState.base_url}/ws?key=${encodeURIComponent(appState.token)}` : null);

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
        const response = await fetch(`${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets?key=${encodeURIComponent(appState.token)}`, {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }
    }

    async function user_upload(image_use: string) {
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
        if (image_use === "scene") {
            scene_file = selectedFileName;
        } else {
            background_file = selectedFileName;
        }
    }

    function reset_scene_vars() {
        scene_name = "";
        scene_file = null;
        background_file = null;
        background_blur = 10;
        scene_columns = 10;
        scene_x_offset = 0;
        scene_y_offset = 0;
    }

    async function create_scene() {
        // TODO: Feedback
        if (!appState.ws) return;

        // @ts-ignore
        await appState.ws.send(PutScene.create(scene_name, scene_file as string, background_file as string, background_blur, scene_columns, scene_x_offset, scene_y_offset, {"fog_squares": {}, "markers": []}));

        // Reset variables after
        reset_scene_vars();
    }

    async function reconnect(){
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
        html = document.getElementsByTagName("html")[0];
        await ensureStore();
        appState.store = appState.store;
        appState.token = ((await appState.store.get('token')) as {value: string}).value as string;

        audio = new Audio("speed.mp3");
        audio.loop = true;

        confetti_function = confetti.create(confetti_canvas, { resize: true });
    });

    let mouse_timeout: any = $state(null);
    $effect(() => {
        if (appState.ws) {
            appState.ws.addListener((msg) => {
                if (msg.type == "Text") {
                    let message = parseServerMessage(msg.data)
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
                            message.state.markers.forEach((marker) => {
                                marker.x = new Tween(marker.x, {
                                    duration: 200,
                                    easing: circOut
                                });
                                marker.y = new Tween(marker.y, {
                                    duration: 200,
                                    easing: circOut
                                });
                            })
                            gameState.scene = message;
                            break;
                        case "scene_list":
                            gameState.scenes = message.scenes;
                            break;
                        case "preload_resource":
                            gameState.resources.add(message.file);
                            break;
                        case "toggle_pressure":
                            gameState.pressure = message.active;
                            break;
                        case "users":
                            gameState.users = message.users;
                            break;
                        case "mouse_position":
                            if (gameState.dm) break;
                            mouseX.target = message.x;
                            mouseY.target = message.y;
                            DMName.value = message.user;
                            showMouse.value = true;
                            clearTimeout(mouse_timeout);
                            mouse_timeout = setTimeout(() => {
                                showMouse.value = false
                            }, 500);
                            break;
                        case "marker_locked":
                            gameState.locked_markers[message.marker_name] = message.locked_by;
                            break;
                        case "marker_freed":
                            delete gameState.locked_markers[message.marker_name];
                            break;
                        case "marker_position":
                            if (!gameState.scene) return;
                            let idx = gameState.scene.state.markers.findIndex((marker) => marker.name === message.marker_name);
                            gameState.scene.state.markers[idx].x = message.x;
                            gameState.scene.state.markers[idx].y = message.y;
                            break;
                        case "update_fog":
                            if (!gameState.scene) return;
                            gameState.scene.state.fog_squares = message.fog_squares
                            break;
                    }
                }
            });
            // Request initial
            appState.ws.send(InitialMessage.create());
        }
    });

    async function select_scene(name: string) {
        if (!appState.ws) return;
        await appState.ws.send(ActivateScene.create(name));
    }
    
    async function delete_scene(name: string) {
        if (!appState.ws) return;
        await appState.ws.send(DeleteScene.create(name));
    }

    const preloadCooldownMap: SvelteMap<string, number> = $state(new SvelteMap());
    const COOLDOWN_MS = 10_000;

    export function shouldPreload(url: string): boolean {
        const now = Date.now();
        const lastTime = preloadCooldownMap.get(url) ?? 0;

        if (now - lastTime >= COOLDOWN_MS) {
            preloadCooldownMap.set(url, now);
            return true;
        }

        return false;
    }

    async function send_preload(file: string) {
        if (!appState.ws) return;
        if (!shouldPreload(file)) return;
        
        await appState.ws.send(PreloadResource.create(file));
    }
    
    async function toggle_pressure() {
        if (!appState.ws) return;
        
        pressure = !pressure;
        await appState.ws.send(TogglePressure.create(pressure));
    }

    let pressure = $state(false);
    let scene_name: string = $state("");
    let scene_file: string | null = $state(null);
    let background_file: string | null = $state(null);
    let background_blur: number = $state(10);
    let scene_columns: number = $state(10);
    let scene_x_offset: number = $state(0);
    let scene_y_offset: number = $state(0);

    let scene_modal: HTMLDialogElement | null = $state(null);
    let scene_chooser_modal: HTMLDialogElement | null = $state(null);

    let audio: HTMLAudioElement | null = $state(null);

    $effect(() => {
        if (!audio) return;
        if (gameState.pressure) {
            audio.play();
            let duration = 15 * 1000;
            let end = Date.now() + duration;
            
            (function frame() {
                confetti_function({
                    particleCount: 2,
                    angle: 60,
                    spread: 55,
                    scalar: 4,
                    origin: { x: 0 },
                    shapes: [stopwatch, time]
                });
                confetti_function({
                    particleCount: 2,
                    angle: 120,
                    spread: 55,
                    scalar: 4,
                    origin: { x: 1 },
                    shapes: [stopwatch, time]
                });

                if (Date.now() < end && gameState.pressure) {
                    requestAnimationFrame(frame);
                }
                }());
        } else {
            audio.pause();
        }
    });

    let updating = $state(false);

    listen("update-started", () => {
        updating = true;
    })

    let cw = $state();
    let ch = $state();
    let html: HTMLHtmlElement | null = $state(null);
    $effect(() => {
        if (!html) return;
        gameState?.scene?.map;
        cw;
        ch;
        scrollbar_visible = html.scrollHeight > html.clientHeight;
    });
    let scrollbar_visible = $state(false);
</script>

<svelte:body 
    bind:clientWidth={cw} 
    bind:clientHeight={ch} 
    onmousedown={() => {mouseDown.value = true}} 
    onmouseup={() => {mouseDown.value = false}}
></svelte:body>

<svelte:head>
    {#if appState.token}
        {#each Array.from(gameState.resources) as resource}
            <link rel="preload" as="image" href={`${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets/${resource}?key=${encodeURIComponent(appState.token)}`}>
        {/each}
    {/if}
    {#if !scrollbar_visible}
        <style>
            html, body {
                scrollbar-gutter: unset !important;
            }
            .scrollbar-gutter-affected {
                scrollbar-gutter: unset !important;
            }
        </style>
    {:else}
        <style>
            .scrollbar-gutter-affected {
                scrollbar-gutter: stable !important;
            }
        </style>
    {/if}
</svelte:head>

<div data-tauri-drag-region class="titlebar z-10">
    <div class="flex justify-center transition-opacity">
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
        <div class="dropdown dropdown-hover">
            <div tabindex="0" role="button" class="btn btn-soft btn-info !text-xs px-2 my-auto h-6">DM</div>
            <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
                <li><button class="btn btn-ghost justify-start" onclick={() => {scene_chooser_modal?.showModal()}}>Szenen</button></li>
                <li><button class="btn btn-ghost justify-start" onclick={toggle_pressure}>
                    {#if pressure}
                    Chill Pill
                    {:else}
                    Pressure
                    {/if}
                </button></li>
            </ul>
        </div>
        {/if}
        {#if updating}
        <div class="tooltip tooltip-bottom" data-tip="Die App wird sich gleich neustarten">
            <div tabindex="0" role="button" class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6 pointer-events-none ml-2">
                Updatevorgang...
            </div>
        </div>
        {/if}
    </div>

    <div class="flex justify-center transition-opacity">
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
<dialog bind:this={scene_modal} class="modal">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Szene erstellen</h3>
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Szenenname</legend>
            <input type="text" bind:value={scene_name} class="input" placeholder="Goblinlager" />
        
            {#if !scene_file}
                <button class="btn btn-neutral mt-4" onclick={() => {user_upload("scene")}}>Map hochladen</button>
            {:else}
                <legend class="fieldset-legend">Spalten</legend>
                <input type="number" bind:value={scene_columns} class="input" placeholder="10" />
                
                <legend class="fieldset-legend">X-Offset</legend>
                <input type="number" bind:value={scene_x_offset} class="input" placeholder="10" />
                
                <legend class="fieldset-legend">Y-Offset</legend>
                <input type="number" bind:value={scene_y_offset} class="input" placeholder="10" />

                <div class="w-full mt-4">
                    <Map file={scene_file} columns={scene_columns} x_offset={scene_x_offset} y_offset={scene_y_offset} fog_squares={[]} markers={[]} />
                </div>

                {#if !background_file}
                    <button class="btn btn-neutral mt-4" onclick={() => {user_upload("background")}}>Hintergrundbild hochladen</button>
                    <p class="fieldset-label">Hintergrundbilder sind optional</p>
                {:else}
                    <legend class="fieldset-legend">Menge an Blur</legend>
                    <input bind:value={background_blur} type="range" min="0" max="30" class="range" />
                    <div class="relative w-full h-30 pt-[30px] mt-4">
                        <BlurredBackground file={background_file} blur={background_blur} />
                    </div>
                {/if}

                <button class="btn btn-neutral mt-4" onclick={create_scene}>Scene erstellen</button>
                <p class="fieldset-label">Du kannst Szenen überschreiben indem du eine Neue Szene mit gleichem Namen erstellst.</p>
            {/if}
        </fieldset>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0" onclick={reset_scene_vars}>close</button>
    </form>
</dialog>
<dialog bind:this={scene_chooser_modal} class="modal">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Szenen</h3>
        <ul class="list bg-base-100 rounded-box shadow-md">
            {#each gameState.scenes as previewScene}
            <li class="list-row flex flex-row items-center justify-between" onmouseenter={() => {send_preload(previewScene.map_file)}}>
                <div class="w-20">
                    <Map file={previewScene.map_file} columns={previewScene.columns} x_offset={previewScene.x_offset} y_offset={previewScene.y_offset} fog_squares={[]}  markers={[]} />
                </div>
                <div class="flex-1">
                    <h3 class="text-base font-bold">{previewScene.name}</h3>
                </div>
                <div>
                    <button class="btn btn-ghost" onclick={() => {select_scene(previewScene.name)}}>
                        Aktivieren
                    </button>
                    <button class="btn btn-soft btn-error" onclick={() => {delete_scene(previewScene.name)}}>
                        Löschen
                    </button>
                </div>
            </li>
            {/each}
            <li>
                <button class="btn btn-ghost w-full" onclick={() => {scene_modal?.showModal()}}>Szene erstellen</button>
            </li>
        </ul>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0">close</button>
    </form>
</dialog>
<canvas bind:this={confetti_canvas} class="fixed top-0 left-0 w-screen h-screen pointer-events-none z-20"></canvas>
{@render children()}

<style>
    :global(html), :global(body) {
        overscroll-behavior: none;
    }
    :global(:root:has( .modal-open, .modal[open], .modal:target, .modal-toggle:checked, .drawer:not(.drawer-open) > .drawer-toggle:checked ) .titlebar > div) {
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
        width: 28px;
        height: 28px;
        user-select: none;
        -webkit-user-select: none;
        color: white;
        cursor: pointer;
    }
    .titlebar-button:hover {
        background: rgba(0, 0, 0, 0.2);
    }

    :global(body) {
        margin-top: 30px;
    }
</style>