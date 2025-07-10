<script lang="ts">
    let { children } = $props();
    import { getVersion } from "@tauri-apps/api/app";
    import "../app.css";
    import "@fortawesome/fontawesome-free/css/all.min.css";
    import { fileTypeFromBuffer } from "file-type";

    import { getCurrentWindow } from "@tauri-apps/api/window";
    import {
        gameState,
        appState,
        ensureStore,
        mouseX,
        mouseY,
        modals,
    } from "../lib/state.svelte";
    import { connect } from "../lib/connection.svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { readFile } from "@tauri-apps/plugin-fs";
    import { fetch } from "@tauri-apps/plugin-http";
    import { onMount } from "svelte";
    import Map from "$lib/components/Map.svelte";
    import {
        ActivateScene,
        DeleteMarker,
        DeleteScene,
        ImportCharacter,
        InitialMessage,
        PlayerMessage,
        PreloadResource,
        PutMarker,
        PutScene,
        TogglePressure,
    } from "$lib/types/messaging/client_messages";
    import {
        EventType,
        MessageType,
        parseServerMessage,
        type MarkerTemplate,
        type SceneState,
    } from "$lib/types/messaging/server_messages";
    import { SvelteMap } from "svelte/reactivity";
    // @ts-ignore
    import confetti from "canvas-confetti";
    import BlurredBackground from "$lib/components/BlurredBackground.svelte";
    import { listen } from "@tauri-apps/api/event";
    import { Tween } from "svelte/motion";
    import { circOut } from "svelte/easing";
    import Marker from "$lib/components/Marker.svelte";
    import Notifications from "$lib/components/Notifications.svelte";
    import { MessageTypes, notify } from "../lib/notifications.svelte";
    import { goto } from "$app/navigation";
    import { Character } from "$lib/types/character";

    const stopwatch = confetti.shapeFromText({ text: "⏱️", scalar: 8 });
    const time = confetti.shapeFromText({ text: "⌚", scalar: 8 });
    const heart = confetti.shapeFromText({ text: "❤️", scalar: 8 });
    const heart2 = confetti.shapeFromText({ text: "💕", scalar: 8 });
    let confetti_canvas: HTMLCanvasElement | null = $state(null);
    let confetti_function: any = $state();

    const appWindow = getCurrentWindow();
    let url = $derived(
        appState.token
            ? `${appState.secure ? "wss://" : "ws://"}${appState.baseUrl}/ws?key=${encodeURIComponent(appState.token)}`
            : null,
    );

    async function upload_file(
        selectedFilePath: string,
        selectedFileName: string,
    ) {
        if (!selectedFilePath || !appState.token) {
            notify("Es ist ein Bild notwendig", MessageTypes.Error, 3000);
            throw new Error(`Upload failed: no file selected`);
        }

        // Read the file as binary
        const fileContent = await readFile(selectedFilePath);
        const fileType = await fileTypeFromBuffer(fileContent);

        if (fileType && fileType.mime.startsWith("video/")) {
            notify(
                "Die Datei wird auf dem Server konvertiert, weshalb der Upload einige Minuten dauern kann.",
                MessageTypes.Info,
                5000,
            );
        }

        // Create form data using Tauri's HTTP client
        const formData = new FormData();
        const blob = new Blob([fileContent]);
        formData.append("file", blob, selectedFileName);

        // Make the request using Tauri's fetch
        const response = await fetch(
            `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets?key=${encodeURIComponent(appState.token)}`,
            {
                method: "POST",
                body: formData,
            },
        );

        if (!response.ok) {
            notify("Hochladen fehlgeschlagen", MessageTypes.Error, 3000);
            throw new Error(
                `Upload failed: ${response.status} ${response.statusText}`,
            );
        } else {
            return response.text();
        }
    }

    async function user_upload(image_use: string) {
        // Open file dialog and get selected file path
        const selected = await open({
            multiple: false,
            filters: [
                { name: "All Files", extensions: ["*"] },
                // You can add specific filters if needed:
                // { name: 'Images', extensions: ['png', 'jpg'] }
            ],
        });

        if (selected === null) {
            // User canceled the selection
            notify("Es ist ein Bild notwendig", MessageTypes.Error, 3000);
            throw new Error(`Upload failed: no file selected`);
        }

        let selectedFilePath = selected;

        // Extract file name from path
        let selectedFileName = selectedFilePath.split(/[/\\]/).pop();
        if (!selectedFileName) {
            notify("Ungültiger Dateiname", MessageTypes.Error, 3000);
            throw new Error("Invalid file name");
        }

        selectedFileName = await upload_file(
            selectedFilePath,
            selectedFileName,
        );
        if (image_use === "scene") {
            scene_file = selectedFileName;
        } else if (image_use === "marker") {
            marker_file = selectedFileName;
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

    function reset_marker_vars() {
        marker_name = "";
        marker_size = 1;
        marker_file = "";
    }

    async function create_scene() {
        if (!appState.ws) {
            return;
        }

        // @ts-ignore
        await appState.ws.send(
            PutScene.create(
                scene_name,
                scene_file as string,
                background_file as string,
                background_blur,
                scene_columns,
                scene_rows,
                scene_x_offset,
                scene_y_offset,
                {
                    fog_squares: {},
                    markers: [],
                    initiative: [],
                    turn: null,
                },
            ),
        );

        // Reset variables after
        reset_scene_vars();
        notify("Szene erstellt", MessageTypes.Success, 3000);
    }

    async function create_marker() {
        if (!appState.ws) return;

        // @ts-ignore
        await appState.ws.send(
            PutMarker.create(marker_name, marker_file, marker_size),
        );

        // Reset variables after
        reset_marker_vars();
        notify("Marker erstellt", MessageTypes.Success, 3000);
    }

    async function reconnect() {
        if (!url) return;
        if (!appState.ws) {
            let result = await connect(url);
            if (result) {
                notify("Verbunden", MessageTypes.Success, 1000);
            } else {
                notify("Verbindung fehlgeschlagen", MessageTypes.Error, 3000);
            }
        } else {
            appState.ws.disconnect();
        }
    }

    async function disconnect(evt: any) {
        evt.preventDefault();
        appState.ws?.disconnect();
        appState.token = "";
        await ensureStore();
        appState.store.set("token", { value: "" });
        goto("/");
    }

    $effect(() => {
        if (appState.ws) {
            appState.ws.addListener((msg) => {
                console.log("Received:", msg);
                // Assume the worst, kill ourselves xD
                if (typeof msg === "string") {
                    notify("Verbindung abgebrochen", MessageTypes.Error, 2000);
                    console.log("Closed connection :o");
                    try {
                        appState.ws?.disconnect();
                    } catch {}
                    appState.ws = null;
                } else if (msg.type == "Close") {
                    notify("Verbindung abgebrochen", MessageTypes.Error, 2000);
                    console.log("Closed connection :o");
                    try {
                        appState.ws?.disconnect();
                    } catch {}
                    appState.ws = null;
                }
            });
        }
    });

    onMount(async () => {
        html = document.getElementsByTagName("html")[0];
        await ensureStore();
        appState.store = appState.store;
        appState.token = (
            (await appState.store.get("token")) as { value: string }
        ).value as string;

        audio = new Audio("speed.mp3");
        audio.loop = true;

        confetti_function = confetti.create(confetti_canvas, { resize: true });
    });

    let mouse_timeout: any = $state(null);
    let large_mouse_timeout: any = $state(null);
    $effect(() => {
        if (!appState.ws) return;
        appState.ws.addListener((msg) => {
            if (msg.type != "Text") return;
            let message = parseServerMessage(msg.data);
            switch (message.type) {
                case MessageType.MESSAGE:
                    notify(
                        {
                            msg: message.message,
                            sender: `${message.sender}${message.sender_dm ? " 👑" : ""}`,
                        },
                        MessageTypes.Message,
                        0,
                    );
                    break;
                case MessageType.INITIAL:
                    gameState.name = message.display_name;
                    gameState.dm = message.dm_status;
                    break;
                case MessageType.EVENT:
                    switch (message.event_type) {
                        case EventType.JOINED:
                            let joined_person = gameState.users.find(
                                (user) => user.name === message.person,
                            );
                            if (!joined_person) {
                                gameState.users.push({
                                    name: message.person,
                                    active: true,
                                    dm: message.person_dm,
                                });
                                return;
                            }
                            joined_person.active = true;
                            if (message.person_dm) {
                                notify(
                                    `${message.person} has awakened from their ancient slumber`,
                                    MessageTypes.Scawy,
                                );
                            } else {
                                notify(
                                    `${message.person} joins the adventure`,
                                    MessageTypes.Neutral,
                                );
                            }
                            break;
                        case EventType.LEFT:
                            let left_person = gameState.users.find(
                                (user) => user.name === message.person,
                            );
                            if (!left_person) return;
                            left_person.active = false;
                            notify(
                                `${message.person} hat sich zurückgezogen`,
                                MessageTypes.Neutral,
                            );
                            break;
                    }
                    break;
                case MessageType.ROLL_RESULT:
                    notify(
                        `${message.sender}${message.sender_dm ? " 👑" : ""} hat ${message.single_dice ? "eine" : message.dices + " ="} ${message.result} gewürfelt${message.dm_only ? " [DM Only]" : ""}`,
                        MessageTypes.Info,
                        10_000,
                    );
                    break;
                case MessageType.SCENE:
                    let new_markers = message.state.markers.map((marker) => {
                        return {
                            ...marker,
                            x: new Tween(marker.x, {
                                duration: 50,
                                easing: circOut,
                            }),
                            y: new Tween(marker.y, {
                                duration: 50,
                                easing: circOut,
                            }),
                        };
                    });
                    gameState.scene = message;
                    gameState.scene.state.markers = new_markers;
                    break;
                case MessageType.SCENE_INITIATIVE:
                    if (!gameState.scene) {
                        console.warn(
                            "No scene set but received initiative information",
                        );
                        break;
                    }
                    gameState.scene.state.initiative = message.initiative;

                    if (
                        gameState.scene.state.initiative.length > 0 &&
                        ((gameState.scene.state.turn !== message.turn &&
                            !gameState.dm &&
                            gameState.characters.find(
                                (character) =>
                                    character.player_name === gameState.name,
                            )?.name === message.turn) ||
                            (gameState.dm &&
                                !gameState.characters.some(
                                    (character) =>
                                        character.name === message.turn,
                                )))
                    ) {
                        notify("It's your turn", MessageTypes.Info, 3_000);
                    }
                    gameState.scene.state.turn = message.turn;

                    break;
                case MessageType.SCENE_LIST:
                    gameState.scenes = message.scenes;
                    break;
                case MessageType.PRELOAD_RESOURCE:
                    gameState.resources.add(message.file);
                    break;
                case MessageType.TOGGLE_PRESSURE:
                    gameState.pressure = message.active;
                    break;
                case MessageType.USERS:
                    gameState.users = message.users;
                    for (const user of gameState.users) {
                        if (user.dm) {
                            gameState.DMName = user.name;
                        }
                    }
                    break;
                case MessageType.MARKER_LOCKED:
                    gameState.lockedMarkers[message.marker_name] =
                        message.locked_by;
                    break;
                case MessageType.MARKER_FREED:
                    delete gameState.lockedMarkers[message.marker_name];
                    break;
                case MessageType.UPDATE_FOG:
                    if (!gameState.scene) return;
                    gameState.scene.state.fog_squares = message.fog_squares;
                    break;
                case MessageType.MARKER_LIB:
                    gameState.markerLib = message.markers;
                    break;
                case MessageType.MOUSE_LARGE:
                    gameState.largeMouse = true;
                    clearTimeout(large_mouse_timeout);
                    large_mouse_timeout = setTimeout(() => {
                        gameState.largeMouse = false;
                    }, 1000);
                    gameState.showMouse = true;
                    clearTimeout(mouse_timeout);
                    mouse_timeout = setTimeout(() => {
                        gameState.showMouse = false;
                    }, 500);
                    break;
                case MessageType.CHARACTERS:
                    gameState.characters = message.characters.map(
                        (character: any) => new Character(character),
                    );
                    break;
                case MessageType.CHECK_RESULT:
                    let bonus_string =
                        message.bonus === 0
                            ? ""
                            : message.bonus > 0
                              ? ` + ${message.bonus} = ${message.result + message.bonus}`
                              : ` - ${message.bonus * -1} = ${message.result + message.bonus}`;
                    notify(
                        `${message.sender} (${message.stat[0].toUpperCase() + message.stat.substring(1)}${message.stat === "initiative" ? "" : " Check"}): ${message.result + bonus_string}`,
                        MessageTypes.Info,
                        -1,
                    );
                    break;
                case MessageType.SAVE_RESULT:
                    let save_bonus_string =
                        message.bonus === 0
                            ? ""
                            : message.bonus > 0
                              ? ` + ${message.bonus} = ${message.result + message.bonus}`
                              : ` - ${message.bonus * -1} = ${message.result + message.bonus}`;
                    notify(
                        `${message.sender} (${message.stat[0].toUpperCase() + message.stat.substring(1)} Save): ${message.result + save_bonus_string}`,
                        MessageTypes.Info,
                        -1,
                    );
                    break;
                case MessageType.COMBAT_STATE:
                    gameState.combat = message.active;
                    break;
            }
        });
        // Request initial
        appState.ws.send(InitialMessage.create());
    });

    async function select_scene(name: string) {
        if (!appState.ws) return;
        await appState.ws.send(ActivateScene.create(name));
        notify("Activated Scene", MessageTypes.Success, 1500);
    }

    async function delete_scene(name: string) {
        if (!appState.ws) return;
        await appState.ws.send(DeleteScene.create(name));
        notify("Szene gelöscht", MessageTypes.Success, 3000);
    }

    async function add_marker(marker: MarkerTemplate) {
        if (!appState.ws || !gameState.scene) return;
        let new_marker = {
            ...marker,
            x: new Tween(0, {
                duration: 50,
                easing: circOut,
            }),
            y: new Tween(0, {
                duration: 50,
                easing: circOut,
            }),
            status_effects: [],
        };
        let i = 1;
        while (
            gameState.scene.state.markers.some(
                (marker) =>
                    marker.name ===
                    new_marker.name + (i === 1 ? "" : ` ${i.toString()}`),
            )
        ) {
            i++;
        }
        new_marker.name = new_marker.name + (i === 1 ? "" : ` ${i.toString()}`);
        gameState.scene.state.markers.push(new_marker);

        let serialized_fog: SceneState["fog_squares"] = {};
        for (const [person, values] of Object.entries(
            gameState.scene.state.fog_squares,
        )) {
            // @ts-ignore
            serialized_fog[person] = Array.from(values);
        }

        await appState.ws.send(
            PutScene.update({
                ...gameState.scene,
                state: {
                    ...gameState.scene.state,
                    fog_squares: serialized_fog,
                },
            }),
        );
        notify("Added the marker to the scene", MessageTypes.Success, 3000);
    }

    async function remove_marker(marker: MarkerTemplate) {
        if (!appState.ws) return;
        await appState.ws.send(DeleteMarker.create(marker.name));
        notify("Marker entfernt", MessageTypes.Success, 3000);
    }

    const preloadCooldownMap: SvelteMap<string, number> = $state(
        new SvelteMap(),
    );
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

    async function importCharacter() {
        if (!appState.ws) return;

        await appState.ws.send(
            ImportCharacter.create(character_url, selected_player),
        );
        character_url = "";
        notify("Charakter wird importiert", MessageTypes.Success, 2000);
    }

    let pressure = $state(false);
    let scene_name: string = $state("");
    let scene_file: string | null = $state(null);
    let background_file: string | null = $state(null);
    let background_blur: number = $state(10);
    let scene_columns: number = $state(10);
    let scene_rows: number = $state(10);
    let scene_x_offset: number = $state(0);
    let scene_y_offset: number = $state(0);
    let character_url = $state("");

    let marker_name = $state("");
    let marker_size = $state(1);
    let marker_file = $state("");

    let scene_modal: HTMLDialogElement | null = $state(null);
    let scene_chooser_modal: HTMLDialogElement | null = $state(null);
    let marker_creation_modal: HTMLDialogElement | null = $state(null);

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
                    shapes: [stopwatch, time],
                });
                confetti_function({
                    particleCount: 2,
                    angle: 120,
                    spread: 55,
                    scalar: 4,
                    origin: { x: 1 },
                    shapes: [stopwatch, time],
                });

                if (Date.now() < end && gameState.pressure) {
                    requestAnimationFrame(frame);
                }
            })();
        } else {
            audio.pause();
        }
    });

    let updating = $state(false);

    listen("update-started", () => {
        updating = true;
    });

    listen("mouse-position", (event: { payload: { x: number; y: number } }) => {
        if (gameState.dm) return;
        mouseX.target = event.payload.x;
        mouseY.target = event.payload.y;
        gameState.showMouse = true;
        clearTimeout(mouse_timeout);
        mouse_timeout = setTimeout(() => {
            gameState.showMouse = false;
        }, 500);
    });

    listen(
        "marker-position",
        (event: { payload: { x: number; y: number; marker_name: string } }) => {
            if (!gameState.scene) return;
            let idx = gameState.scene.state.markers.findIndex(
                (marker) => marker.name === event.payload.marker_name,
            );
            gameState.scene.state.markers[idx].x.target = event.payload.x;
            gameState.scene.state.markers[idx].y.target = event.payload.y;
        },
    );

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
    let selected_player = $state(gameState.name);
</script>

<svelte:window
    onbeforeunload={() => {
        appState.ws?.disconnect();
    }}
/>

<svelte:body
    bind:clientWidth={cw}
    bind:clientHeight={ch}
    onmousedown={() => {
        appState.mouseDown = true;
    }}
    onmouseup={() => {
        appState.mouseDown = false;
    }}
/>

<svelte:head>
    {#if appState.token}
        {#each Array.from(gameState.resources) as resource}
            <link
                rel="preload"
                as="image"
                href={`${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets/${resource}?key=${encodeURIComponent(appState.token)}`}
            />
        {/each}
    {/if}
    {#if !scrollbar_visible}
        <style>
            html,
            body {
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
    <style>
        .modal {
            width: 100vw !important;
        }
        div.multiselect > ul.selected > li {
            display: flex;
            flex-direction: row;
        }
    </style>
</svelte:head>

<div data-tauri-drag-region class="titlebar z-10">
    <div class="flex justify-center transition-opacity">
        <button
            onclick={reconnect}
            oncontextmenu={disconnect}
            aria-label="Reconnect"
            class="cursor-pointer peer"
        >
            <div class="h-[30px] w-[30px] flex justify-center items-center">
                {#if appState.ws}
                    <div
                        aria-label="success"
                        class="status status-success"
                    ></div>
                {:else}
                    <div class="inline-grid *:[grid-area:1/1]">
                        <div class="status status-error animate-ping"></div>
                        <div class="status status-error"></div>
                    </div>
                {/if}
            </div>
        </button>
        {#if gameState.name === "Laura"}
            <button
                class="text-sm"
                onclick={async () => {
                    if (!appState.ws) {
                        return;
                    }

                    // @ts-ignore
                    await appState.ws.send(
                        PlayerMessage.create("Easteregg gefunden ;D", "Nils"),
                    );

                    let duration = 1000;
                    let end = Date.now() + duration;
                    (function frame() {
                        confetti_function({
                            particleCount: 2,
                            angle: 60,
                            spread: 55,
                            scalar: 4,
                            origin: { x: 0 },
                            shapes: [heart, heart2],
                        });
                        confetti_function({
                            particleCount: 2,
                            angle: 120,
                            spread: 55,
                            scalar: 4,
                            origin: { x: 1 },
                            shapes: [heart, heart2],
                        });

                        if (Date.now() < end) {
                            requestAnimationFrame(frame);
                        }
                    })();
                }}>🫶</button
            >
        {/if}
        {#if gameState.dm}
            <div class="dropdown dropdown-hover">
                <div
                    tabindex="0"
                    role="button"
                    class="btn btn-soft btn-info !text-xs px-2 my-auto h-6"
                >
                    DM
                </div>
                <ul
                    class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm"
                >
                    <li>
                        <button
                            class="btn btn-ghost justify-start"
                            onclick={() => {
                                scene_chooser_modal?.showModal();
                            }}>Scenes</button
                        >
                    </li>
                    <li>
                        <button
                            class="btn btn-ghost justify-start"
                            onclick={toggle_pressure}
                        >
                            {#if pressure}
                                Chill Pill
                            {:else}
                                Pressure
                            {/if}
                        </button>
                    </li>
                </ul>
            </div>
        {/if}
        {#if updating}
            <div
                class="tooltip tooltip-bottom"
                data-tip="Die App wird sich gleich neustarten"
            >
                <div
                    tabindex="0"
                    role="button"
                    class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6 pointer-events-none ml-2"
                >
                    Updatevorgang...
                </div>
            </div>
        {/if}
        {#await getVersion() then version}
            <span
                class="self-center text-gray-500 opacity-0 peer-hover:opacity-100 transition-opacity ml-2"
                >{version}</span
            >
        {/await}
    </div>

    <div class="flex justify-center transition-opacity">
        <button
            class="titlebar-button"
            id="titlebar-minimize"
            onclick={appWindow.minimize}
            aria-label="Minimize"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                ><path fill="currentColor" d="M19 13H5v-2h14z" /></svg
            >
        </button>
        <button
            class="titlebar-button"
            id="titlebar-maximize"
            onclick={appWindow.toggleMaximize}
            aria-label="Maximize"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                ><path
                    fill="currentColor"
                    d="M19 3H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m0 2v14H5V5z"
                /></svg
            >
        </button>
        <button
            class="titlebar-button"
            id="titlebar-close"
            onclick={appWindow.close}
            aria-label="Close"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                ><path
                    fill="currentColor"
                    d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
                /></svg
            >
        </button>
    </div>
</div>
<dialog bind:this={scene_modal} class="modal">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Create Scene</h3>
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Szenenname</legend>
            <input
                type="text"
                bind:value={scene_name}
                class="input"
                placeholder="Goblinlager"
            />

            {#if !scene_file}
                <button
                    class="btn btn-neutral mt-4"
                    onclick={() => {
                        user_upload("scene");
                    }}>Map hochladen</button
                >
            {:else}
                <legend class="fieldset-legend">Spalten</legend>
                <input
                    type="number"
                    bind:value={scene_columns}
                    class="input"
                    placeholder="10"
                />

                <legend class="fieldset-legend">X-Offset</legend>
                <input
                    type="number"
                    bind:value={scene_x_offset}
                    class="input"
                    placeholder="10"
                />

                <legend class="fieldset-legend">Y-Offset</legend>
                <input
                    type="number"
                    bind:value={scene_y_offset}
                    class="input"
                    placeholder="10"
                />

                <div class="w-full mt-4">
                    <Map
                        file={scene_file}
                        columns={scene_columns}
                        set_rows={(rows: number) => (scene_rows = rows)}
                        x_offset={scene_x_offset}
                        y_offset={scene_y_offset}
                        fog_squares={{}}
                        markers={[]}
                    />
                </div>

                {#if !background_file}
                    <button
                        class="btn btn-neutral mt-4"
                        onclick={() => {
                            user_upload("background");
                        }}>Hintergrundbild hochladen</button
                    >
                    <p class="fieldset-label">
                        Hintergrundbilder sind optional
                    </p>
                {:else}
                    <legend class="fieldset-legend">Menge an Blur</legend>
                    <input
                        bind:value={background_blur}
                        type="range"
                        min="0"
                        max="30"
                        class="range"
                    />
                    <div class="relative w-full h-30 pt-[30px] mt-4">
                        <BlurredBackground
                            file={background_file}
                            blur={background_blur}
                        />
                    </div>
                {/if}

                <button class="btn btn-neutral mt-4" onclick={create_scene}>
                    Scene erstellen
                </button>
                <p class="fieldset-label">
                    Du kannst Szenen überschreiben indem du eine Neue Szene mit
                    gleichem Namen erstellst.
                </p>
            {/if}
        </fieldset>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0" onclick={reset_scene_vars}>close</button>
    </form>
</dialog>
<dialog bind:this={scene_chooser_modal} class="modal">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Scenes</h3>
        <ul class="list bg-base-100 rounded-box shadow-md">
            {#each gameState.scenes as previewScene}
                <li
                    class="list-row flex flex-row items-center justify-between"
                    onmouseenter={() => {
                        send_preload(previewScene.map_file);
                    }}
                >
                    <div class="w-20">
                        <Map
                            file={previewScene.map_file}
                            columns={previewScene.columns}
                            x_offset={previewScene.x_offset}
                            y_offset={previewScene.y_offset}
                            fog_squares={{}}
                            markers={[]}
                        />
                    </div>
                    <div class="flex-1">
                        <h3 class="text-base font-bold">{previewScene.name}</h3>
                    </div>
                    <div>
                        <button
                            class="btn btn-ghost"
                            onclick={() => {
                                select_scene(previewScene.name);
                            }}
                        >
                            Activate
                        </button>
                        <button
                            class="btn btn-soft btn-error"
                            onclick={() => {
                                delete_scene(previewScene.name);
                            }}
                        >
                            Delete
                        </button>
                    </div>
                </li>
            {/each}
            <li>
                <button
                    class="btn btn-ghost w-full"
                    onclick={() => {
                        scene_modal?.showModal();
                    }}>Create Scene</button
                >
            </li>
        </ul>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0">close</button>
    </form>
</dialog>
<dialog bind:this={modals.markerModal} class="modal">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Marker Library</h3>
        <ul class="list bg-base-100 rounded-box shadow-md">
            {#each gameState.markerLib as marker}
                <li class="list-row flex flex-row items-center justify-between">
                    <div class="relative flex flex-col gap-1 items-center w-20">
                        <Marker
                            columnCount="100%"
                            dragOptions={{ disabled: true }}
                            {marker}
                            mapUse={false}
                        />
                        <span class="text-center">{marker.name}</span>
                        <span
                            class="badge absolute top-0 -right-1/2 -translate-x-1/2"
                        >
                            <i
                                class="fa-solid fa-up-right-and-down-left-from-center"
                            ></i>
                            {marker.size}
                        </span>
                    </div>
                    <div class="flex flex-row gap-2">
                        <button
                            class="btn btn-ghost"
                            onclick={() => {
                                add_marker(marker);
                            }}>Add</button
                        >
                        <button
                            class="btn btn-soft btn-error"
                            onclick={() => {
                                remove_marker(marker);
                            }}>Delete</button
                        >
                    </div>
                </li>
            {/each}
            <li>
                <button
                    class="btn btn-ghost w-full"
                    onclick={() => {
                        marker_creation_modal?.showModal();
                    }}>Create Marker</button
                >
            </li>
        </ul>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0">close</button>
    </form>
</dialog>
<dialog bind:this={modals.characterImportModal} class="modal">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Charakter Importieren</h3>
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Charakter URL</legend>
            <input
                type="text"
                class="input"
                placeholder="https://www.dndbeyond.com/characters/xxxxxxxxx"
                bind:value={character_url}
            />
            <p class="fieldset-label">
                Es ist wichtig, dass der Charakter öffentlich gestellt ist
            </p>
            <legend class="fieldset-legend">Zugehöriger Spieler</legend>
            <select
                class="select select-sm !bg-[var(--color-base-100)]"
                bind:value={selected_player}
            >
                {#each gameState.users as player}
                    <option value={player.name}
                        >{#if player.active}🟢{:else}🔴{/if}
                        {player.name}</option
                    >
                {/each}
            </select>
            <button
                class="btn btn-neutral mt-4"
                onclick={() => {
                    importCharacter();
                }}>Importieren</button
            >
        </fieldset>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0">close</button>
    </form>
</dialog>
<dialog bind:this={marker_creation_modal} class="modal">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Marker erstellen</h3>
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Markername</legend>
            <input
                type="text"
                bind:value={marker_name}
                class="input"
                placeholder="Grom"
            />
            <legend class="fieldset-legend">Größe</legend>
            <input
                type="number"
                bind:value={marker_size}
                class="input"
                placeholder="1"
            />
            <p class="fieldset-label">
                Die Größe gibt an, wie viele Spalten (und somit auch Zeilen) der
                Marker einnimmt.
            </p>

            {#if !marker_file}
                <button
                    class="btn btn-neutral mt-4"
                    onclick={() => {
                        user_upload("marker");
                    }}>Marker-Bild</button
                >
            {:else}
                <Marker
                    columnCount="100%"
                    dragOptions={{ disabled: true }}
                    marker={{
                        name: marker_name,
                        size: marker_size,
                        file: marker_file,
                    }}
                    mapUse={false}
                />
                <button class="btn btn-neutral mt-4" onclick={create_marker}
                    >Marker erstellen</button
                >
                <p class="fieldset-label">
                    Du kannst Marker überschreiben indem du einen neuen Marker
                    mit gleichem Namen erstellst.
                </p>
            {/if}
        </fieldset>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0" onclick={reset_marker_vars}>close</button>
    </form>
</dialog>
<canvas
    bind:this={confetti_canvas}
    class="fixed top-0 left-0 w-screen h-screen pointer-events-none z-20"
></canvas>
<div
    class="fixed bottom-0 left-0 w-screen z-[9999] overflow-hidden scrollbar-gutter-affected flex justify-end pointer-events-none"
>
    <div
        class="w-80 p-2 pointer-events-none flex flex-col justify-end items-end gap-1"
    >
        <Notifications />
    </div>
</div>

{@render children()}

<style>
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
</style>
