<script lang="ts">
    let { children } = $props();
    import { getVersion } from "@tauri-apps/api/app";
    import "../app.css";
    import "@fortawesome/fontawesome-free/css/all.min.css";

    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { getCurrentWebview } from "@tauri-apps/api/webview";
    import { fileDropState } from "$lib/drag.svelte";
    import { spill_blood } from "$lib/effects";
    import {
        gameState,
        appState,
        ensureStore,
        show_pointer,
        modals,
        dialogs,
        remember_roll,
        roller,
        assetState,
        adminState,
        get_own_character,
        resetGamestate,
        selection,
    } from "../lib/state.svelte";
    import { connect } from "../lib/connection.svelte";
    import { file_stem_of, upload_path } from "$lib/upload.svelte";
    import {
        audioState,
        effect_volume,
        guess_sound_kind,
        load_volume,
        music_volume,
        play_effect,
        play_music,
        set_volume,
        stop_music,
    } from "$lib/audio.svelte";
    import { onMount } from "svelte";
    import {
        ImportCharacter,
        InitialMessage,
        PutMarker,
        PutSound,
    } from "$lib/types/messaging/client_messages";
    import {
        EventType,
        MessageType,
        parseServerMessage,
        type AnyRoll,
    } from "$lib/types/messaging/server_messages";
    // @ts-ignore
    import confetti from "canvas-confetti";
    import { listen } from "@tauri-apps/api/event";
    import { Tween } from "svelte/motion";
    import { circOut } from "svelte/easing";
    import SceneDialog from "$lib/components/SceneDialog.svelte";
    import MarkerDialog from "$lib/components/MarkerDialog.svelte";
    import MonsterDialog from "$lib/components/MonsterDialog.svelte";
    import AssetBrowser from "$lib/components/AssetBrowser.svelte";
    import UserAdminDialog from "$lib/components/UserAdminDialog.svelte";
    import Notifications from "$lib/components/Notifications.svelte";
    import { MessageTypes, notify } from "../lib/notifications.svelte";
    import { bonus_string, mode_suffix, stat_label } from "$lib/rolls";
    import { normalize_condition } from "$lib/conditions";
    import { load_dice_skin } from "$lib/dice-skins.svelte";
    import DiceSkinPicker from "$lib/components/DiceSkinPicker.svelte";
    import { goto } from "$app/navigation";
    import { Character } from "$lib/types/character";
    import { invoke } from "@tauri-apps/api/core";
    import { setActivity, start, stop } from "tauri-plugin-drpc";
    import { Activity, Assets, Timestamps } from "tauri-plugin-drpc/activity";

    const stopwatch = confetti.shapeFromText({ text: "⏱️", scalar: 8 });
    const time = confetti.shapeFromText({ text: "⌚", scalar: 8 });
    let confetti_canvas: HTMLCanvasElement | null = $state(null);
    let confetti_function: any = $state();

    let isDev: boolean = $state(false);

    const appWindow = getCurrentWindow();
    let url = $derived(
        appState.token
            ? `${appState.secure ? "wss://" : "ws://"}${appState.baseUrl}/ws?key=${encodeURIComponent(appState.token)}`
            : null,
    );

    /** Files dropped from the OS onto the marker or scene panel */
    async function handle_file_drop(target: string | null, paths: string[]) {
        if (!gameState.dm || paths.length === 0) return;

        if (target === "scenes") {
            dialogs.scene?.open(paths[0]);
        } else if (target === "markers" && paths.length === 1) {
            dialogs.marker?.open(paths[0]);
        } else if (target === "sounds") {
            for (const path of paths) {
                const asset = await upload_path(path);
                if (!asset || !appState.ws) continue;
                await appState.ws.send(
                    PutSound.create(
                        file_stem_of(path),
                        asset,
                        await guess_sound_kind(asset),
                    ),
                );
            }
        } else if (target === "markers") {
            // Several files at once become markers right away
            notify(
                `${paths.length} Dateien werden hochgeladen…`,
                MessageTypes.Info,
                3000,
            );
            let created = 0;
            for (const path of paths) {
                const asset = await upload_path(path);
                if (!asset || !appState.ws) continue;
                await appState.ws.send(
                    PutMarker.create(file_stem_of(path), asset, 1),
                );
                created++;
            }
            if (created > 0) {
                notify(
                    `${created} Marker erstellt`,
                    MessageTypes.Success,
                    3000,
                );
            }
        } else {
            notify(
                "Zieh Bilder auf das Marker- oder Szenen-Panel und Audio auf das Musik-Panel, um sie hochzuladen.",
                MessageTypes.Info,
                4000,
            );
        }
    }

    function file_drop_target_at(position: { x: number; y: number }) {
        const element = document.elementFromPoint(
            position.x / window.devicePixelRatio,
            position.y / window.devicePixelRatio,
        );
        return (
            element?.closest<HTMLElement>("[data-file-drop]")?.dataset
                .fileDrop ?? null
        );
    }

    let reconnecting = $state(false);

    async function reconnect() {
        if (!url || reconnecting) return;
        if (!appState.ws) {
            reconnecting = true;
            let result = await connect(url);
            if (result) {
                notify("Verbunden", MessageTypes.Success, 1000);
            } else {
                notify("Verbindung fehlgeschlagen", MessageTypes.Error, 3000);
            }
            setTimeout(() => {
                reconnecting = false;
            }, 200);
        } else {
            reconnecting = true;
            // First, so its close doesn't count as a lost connection
            const old_ws = appState.ws;
            appState.ws = null;
            try {
                await old_ws.disconnect();
            } catch {}
            let result = await connect(url);
            if (result) {
                notify("Verbunden", MessageTypes.Success, 1000);
            } else {
                notify("Verbindung fehlgeschlagen", MessageTypes.Error, 3000);
            }
            setTimeout(() => {
                reconnecting = false;
            }, 200);
        }
    }

    async function disconnect(evt: any) {
        evt.preventDefault();
        // First, so its close doesn't count as a lost connection
        const old_ws = appState.ws;
        appState.ws = null;
        resetGamestate();
        stop_music();
        try {
            await old_ws?.disconnect();
        } catch {}
        appState.token = "";
        await ensureStore();
        appState.store.set("token", { value: "" });
        goto("/");
    }

    $effect(() => {
        const ws = appState.ws;
        if (!ws) return;
        // Events of an old socket must not tear down a newer connection
        return ws.addListener((msg) => {
            if (appState.ws !== ws) return;
            if (typeof msg === "string" || msg.type == "Close") {
                console.log("Received:", msg);
                notify("Verbindung abgebrochen", MessageTypes.Error, 2000);
                console.log("Connection Closed :o");
                ws.disconnect().catch(() => {});
                appState.ws = null;
                resetGamestate();
                stop_music();
            } else {
                // @ts-ignore
                console.log(`Received ${JSON.parse(msg.data).type}:`, msg);
            }
        });
    });

    $effect(() => {
        if (!appState.store || !html || !appState.theme) return;
        html?.setAttribute("data-theme", appState.theme);
        appState.store.set("theme", { value: appState.theme }).then(() => {
            appState.store.save();
        });
    });

    onMount(async () => {
        html = document.getElementsByTagName("html")[0];
        await ensureStore();
        appState.store = appState.store;
        // Nothing is stored yet on the very first launch
        appState.token =
            (
                (await appState.store.get("token")) as
                    | { value: string }
                    | undefined
            )?.value ?? null;
        appState.theme =
            (
                ((await appState.store.get("theme")) as {
                    value: string;
                } | null) || { value: null }
            ).value || "dark";
        html?.setAttribute("data-theme", appState.theme);

        await load_volume();
        await load_dice_skin();
        audio = new Audio("speed.mp3");
        audio.loop = true;

        sword_ping = new Audio("sword_sound.mp3");

        confetti_function = confetti.create(confetti_canvas, { resize: true });

        await getCurrentWebview().onDragDropEvent((event) => {
            const payload = event.payload;
            if (payload.type === "leave") {
                fileDropState.over = null;
            } else if (payload.type === "drop") {
                fileDropState.over = null;
                handle_file_drop(
                    file_drop_target_at(payload.position),
                    payload.paths,
                );
            } else if (gameState.dm) {
                fileDropState.over = file_drop_target_at(payload.position);
            }
        });

        await start("1394274196603011223");
        isDev = await invoke("is_dev");
        if (isDev) {
            setDiscordStatus(
                choose([
                    "Fixt die Bugs aus letzter Session",
                    "Baut neue lustige Features",
                    "Refactored den Code",
                ]),
                isDev,
            );
        }
    });

    function setDiscordStatus(message: string, dev: boolean) {
        const assets = new Assets()
            .setLargeImage(!dev ? "favicon" : "dev_favicon")
            .setLargeText("How to play DND Online fast");

        const discordActivity = new Activity()
            .setState(message)
            .setAssets(assets)
            .setTimestamps(new Timestamps(Date.now()));

        setActivity(discordActivity);
    }


    function choose(choices: string[]) {
        var index = Math.floor(Math.random() * choices.length);
        return choices[index];
    }

    $effect(() => {
        const ws = appState.ws;
        if (!ws) return;
        const unlisten = ws.addListener(async (msg) => {
            if (appState.ws !== ws || msg.type != "Text") return;
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

                    setDiscordStatus(
                        isDev
                            ? choose([
                                  "Fixt die Bugs aus letzter Session",
                                  "Baut neue lustige Features",
                                  "Refactored den Code",
                              ])
                            : gameState.dm
                              ? choose([
                                    "Plant einen Total Party Kill",
                                    "Entscheidet über das Schicksal der Party",
                                    "Erschafft neue Monster",
                                ])
                              : choose([
                                    "Auf einem Abenteuer",
                                    "Sammelt Schätze",
                                    "Macht die Tavernen unsicher",
                                    "Am 4. Nat 1 hintereinander würfeln",
                                ]),
                        isDev,
                    );
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
                                    `${message.person} ist aus seinem uralten Schlummer erwacht`,
                                    MessageTypes.Scawy,
                                );
                            } else {
                                notify(
                                    `${message.person} schließt sich dem Abenteuer an`,
                                    MessageTypes.Neutral,
                                );
                            }
                            break;
                        case EventType.LEFT:
                            let left_person = gameState.users.find(
                                (user) => user.name === message.person,
                            );
                            // Markers they were dragging can be moved again
                            for (const [marker_name, locked_by] of Object.entries(
                                gameState.lockedMarkers,
                            )) {
                                if (locked_by === message.person) {
                                    delete gameState.lockedMarkers[marker_name];
                                }
                            }
                            if (!left_person) return;
                            left_person.active = false;
                            notify(
                                `${message.person} hat sich zurückgezogen`,
                                MessageTypes.Neutral,
                            );
                            break;
                        case EventType.SELF_JOIN:
                            notify(
                                `Du hast dich von einem anderen Gerät eingeloggt`,
                                MessageTypes.Warning,
                                0,
                            );
                            ws.disconnect().catch(() => {});
                            break;
                    }
                    break;
                case MessageType.ROLL_RESULT:
                    // Everyone sees the dice land first, in the history too
                    await after_dice(message);
                    remember_roll(message);
                    notify(
                        `${message.sender}${message.sender_dm ? " 👑" : ""} hat ${message.single_dice ? "eine" : message.dices + " ="} ${message.result} gewürfelt${mode_suffix(message.mode, message.d20s)}${message.dm_only ? " (nur DM)" : ""}`,
                        MessageTypes.Info,
                        gameState.dm ? -1 : 5000,
                    );
                    break;
                case MessageType.SCENE:
                    let new_markers = message.state.markers.map((marker) => {
                        return {
                            ...marker,
                            status_effects: (marker.status_effects ?? []).map(
                                normalize_condition,
                            ),
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
                    // Markers selected in another scene may share names with these
                    if (gameState.scene?.name !== message.name) {
                        selection.clear();
                    }
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
                        gameState.combat &&
                        message.turn &&
                        gameState.scene.state.turn !== message.turn &&
                        ((!gameState.dm &&
                            get_own_character()?.name === message.turn) ||
                            (gameState.dm &&
                                !gameState.characters.some(
                                    (character) =>
                                        character.name === message.turn,
                                )))
                    ) {
                        notify("Du bist dran", MessageTypes.Info, 3_000);
                        if (sword_ping) {
                            sword_ping.volume = effect_volume();
                            sword_ping.play();
                        }
                    }
                    gameState.scene.state.turn = message.turn;

                    // Older clients don't send the round, it stays as it was then
                    if (typeof message.round === "number") {
                        if (
                            gameState.combat &&
                            message.round > 1 &&
                            message.round !== gameState.scene.state.round
                        ) {
                            notify(
                                `Runde ${message.round}`,
                                MessageTypes.Neutral,
                                2_000,
                            );
                        }
                        gameState.scene.state.round = message.round;
                    }

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
                case MessageType.USERS: {
                    gameState.users = message.users;
                    for (const user of gameState.users) {
                        if (user.dm) {
                            gameState.DMName = user.name;
                        }
                    }
                    // Another DM changed this one's rights, the server already applies them
                    const own_user = message.users.find(
                        (user) => user.name === gameState.name,
                    );
                    if (own_user && own_user.dm !== gameState.dm) {
                        notify(
                            own_user.dm
                                ? "Du bist jetzt DM"
                                : "Du bist jetzt Spieler",
                            MessageTypes.Info,
                            4000,
                        );
                        // Everything again, DMs get more than players
                        ws.send(InitialMessage.create());
                    }
                    break;
                }
                case MessageType.MARKER_LOCKED:
                    gameState.lockedMarkers[message.marker_name] =
                        message.locked_by;
                    break;
                case MessageType.MARKER_FREED:
                    delete gameState.lockedMarkers[message.marker_name];
                    // The final position, live positions over QUIC may have been lost
                    if (
                        gameState.scene &&
                        typeof message.x === "number" &&
                        typeof message.y === "number"
                    ) {
                        const freed_marker = gameState.scene.state.markers.find(
                            (marker) => marker.name === message.marker_name,
                        );
                        freed_marker?.x.set(message.x);
                        freed_marker?.y.set(message.y);
                    }
                    break;
                case MessageType.UPDATE_FOG:
                    if (!gameState.scene) return;
                    gameState.scene.state.fog_squares = message.fog_squares;
                    break;
                case MessageType.MARKER_LIB:
                    gameState.markerLib = message.markers;
                    break;
                case MessageType.MOUSE_LARGE:
                    show_pointer(message.user ?? "", undefined, undefined, true);
                    break;
                case MessageType.BLOOD:
                    spill_blood(message.x, message.y, message.size);
                    break;
                case MessageType.DRAWING_ADDED: {
                    if (!gameState.scene) break;
                    // Our own drawings are already there
                    const drawings = (gameState.scene.state.drawings ?? []).filter(
                        (drawing) => drawing.id !== message.drawing.id,
                    );
                    gameState.scene.state.drawings = [...drawings, message.drawing];
                    break;
                }
                case MessageType.SOUND_LIB:
                    audioState.sounds = message.sounds;
                    // Sounds from a library are there once the server downloaded them
                    for (const name of audioState.importing) {
                        if (message.sounds.some((sound) => sound.name === name)) {
                            notify(`„${name}“ hinzugefügt`, MessageTypes.Success, 2000);
                        }
                    }
                    audioState.importing = audioState.importing.filter(
                        (name) => !message.sounds.some((sound) => sound.name === name),
                    );
                    break;
                case MessageType.TABLETOP_AUDIO:
                    audioState.tabletop = message.tracks;
                    break;
                case MessageType.SOUND_IMPORT_FAILED:
                    audioState.importing = audioState.importing.filter(
                        (name) => name !== message.name,
                    );
                    notify(
                        `„${message.name}“ ließ sich nicht herunterladen`,
                        MessageTypes.Error,
                        4000,
                    );
                    break;
                case MessageType.PLAY_SOUND:
                    if (message.kind === "music") {
                        play_music(message.name, message.file, message.started_at);
                    } else {
                        play_effect(message.file);
                    }
                    break;
                case MessageType.STOP_MUSIC:
                    stop_music();
                    break;
                case MessageType.USER_ADMIN:
                    adminState.users = message.users;
                    break;
                case MessageType.ASSET_LIST:
                    assetState.assets = message.assets;
                    break;
                case MessageType.DRAWINGS_DELETED:
                    if (!gameState.scene) break;
                    gameState.scene.state.drawings = (
                        gameState.scene.state.drawings ?? []
                    ).filter((drawing) => !message.ids.includes(drawing.id));
                    break;
                case MessageType.CHARACTERS:
                    gameState.characters = message.characters.map(
                        (character: any) => new Character(character),
                    );
                    break;
                case MessageType.CHECK_RESULT:
                    await after_dice(message);
                    remember_roll(message);
                    notify(
                        `${message.sender} (${message.stat === "initiative" ? "Initiative" : `Check: ${stat_label(message.stat)}`}): ${message.result}${bonus_string(message.result, message.bonus)}${mode_suffix(message.mode, message.d20s)}`,
                        MessageTypes.Info,
                        gameState.dm ? -1 : 5000,
                    );
                    break;
                case MessageType.SAVE_RESULT:
                    await after_dice(message);
                    remember_roll(message);
                    notify(
                        `${message.sender} (Rettungswurf: ${stat_label(message.stat)}): ${message.result}${bonus_string(message.result, message.bonus)}${mode_suffix(message.mode, message.d20s)}`,
                        MessageTypes.Info,
                        gameState.dm ? -1 : 5000,
                    );
                    break;
                case MessageType.COMBAT_STATE:
                    gameState.combat = message.active;
                    break;
                case MessageType.ROLL_HISTORY:
                    // Rolls the server doesn't have for this client stay
                    gameState.rolls = [
                        ...message.rolls,
                        ...gameState.rolls.filter((roll) => roll.local),
                    ].toSorted((a, b) => (a.time ?? 0) - (b.time ?? 0));
                    break;
            }
        });
        // Request initial
        ws.send(InitialMessage.create());
        return unlisten;
    });

    /** Waits until everyone saw the dice of somebody else's roll land */
    async function after_dice(roll: AnyRoll) {
        try {
            await roller.replay?.(roll);
        } catch (e) {
            console.error("Showing the dice of a roll failed", e);
        }
    }

    async function importCharacter() {
        if (!appState.ws) return;
        if (!character_url.trim() || !selected_player) {
            notify(
                "Bitte gib eine Charakter-URL an und wähle einen Spieler",
                MessageTypes.Error,
                3000,
            );
            return;
        }

        await appState.ws.send(
            ImportCharacter.create(character_url, selected_player),
        );
        character_url = "";
        notify("Charakter wird importiert", MessageTypes.Success, 2000);
    }

    let pressure = $state(false);
    let character_url = $state("");

    let audio: HTMLAudioElement | null = $state(null);
    let sword_ping: HTMLAudioElement | null = $state(null);

    // The pressure music follows the music volume and mute
    $effect(() => {
        if (audio) audio.volume = music_volume();
    });

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

    listen("backend-error", (event: { payload: string }) => {
        notify(event.payload, MessageTypes.Error, 0);
        console.log(`Backend Error: ${event.payload}`);
    });

    listen("backend-debug", (event: { payload: string }) => {
        console.log(`Backend Debug: ${event.payload}`);
    });

    listen(
        "mouse-position",
        (event: { payload: { x: number; y: number; name: string } }) => {
            // Without a name it comes from an older client
            show_pointer(event.payload.name, event.payload.x, event.payload.y);
        },
    );

    listen(
        "marker-position",
        (event: { payload: { x: number; y: number; marker_name: string } }) => {
            // The marker may be gone already, e.g. after a scene switch mid-drag
            const marker = gameState.scene?.state.markers.find(
                (marker) => marker.name === event.payload.marker_name,
            );
            if (!marker) return;
            marker.x.target = event.payload.x;
            marker.y.target = event.payload.y;
        },
    );

    invoke("frontend_ready");

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
    // Picked in the import dialog; gameState.name isn't known yet when this runs
    let selected_player = $state("");

    let theme_modal: HTMLDialogElement | null = $state(null);
</script>

<svelte:window
    onbeforeunload={async () => {
        await appState.ws?.disconnect();
        await stop();
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
    </style>
</svelte:head>

<div data-tauri-drag-region class="titlebar z-10">
    <div class="flex justify-center transition-opacity gap-2">
        <button
            onclick={reconnect}
            oncontextmenu={disconnect}
            aria-label="Reconnect"
            class="cursor-pointer peer -mr-2"
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
        {#if gameState.dm}
            <div
                class="btn btn-soft btn-info !text-xs px-2 my-auto h-6 pointer-events-none"
            >
                DM
            </div>
        {/if}
        <button
            class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6"
            onclick={() => theme_modal?.showModal()}>Aussehen</button
        >
        {#if gameState.dm}
            <button
                class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6"
                onclick={() => dialogs.users?.open()}
            >
                <i class="fa-solid fa-users-gear"></i> Spieler
            </button>
            <button
                class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6"
                onclick={() => dialogs.assets?.open()}
            >
                <i class="fa-solid fa-folder-open"></i> Dateien
            </button>
        {/if}
        <div class="dropdown dropdown-bottom my-auto">
            <button
                tabindex="0"
                class="btn btn-soft btn-primary !text-xs px-2 h-6"
                aria-label="Lautstärke"
                title={audioState.music
                    ? `Läuft: ${audioState.music.name}`
                    : "Lautstärke"}
            >
                <i
                    class="fa-solid {audioState.muted
                        ? 'fa-volume-xmark'
                        : 'fa-volume-high'}"
                ></i>
                {#if audioState.music}
                    <i class="fa-solid fa-music animate-pulse"></i>
                {/if}
            </button>
            <div
                tabindex="-1"
                class="dropdown-content bg-base-100 rounded-box z-20 w-60 p-3 shadow-sm flex flex-col gap-2"
            >
                {#if audioState.music}
                    <p class="text-sm truncate">
                        <i class="fa-solid fa-music"></i>
                        {audioState.music.name}
                    </p>
                {/if}
                <label class="text-xs">
                    Musik
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        class="range range-xs"
                        value={audioState.music_volume}
                        oninput={(event) =>
                            set_volume({
                                music_volume: Number(
                                    event.currentTarget.value,
                                ),
                            })}
                    />
                </label>
                <label class="text-xs">
                    Effekte
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        class="range range-xs"
                        value={audioState.effect_volume}
                        oninput={(event) =>
                            set_volume({
                                effect_volume: Number(
                                    event.currentTarget.value,
                                ),
                            })}
                    />
                </label>
                <label class="label text-xs">
                    <input
                        type="checkbox"
                        class="toggle toggle-xs"
                        checked={audioState.muted}
                        onchange={(event) =>
                            set_volume({ muted: event.currentTarget.checked })}
                    />
                    Stumm
                </label>
            </div>
        </div>
        {#if updating}
            <div
                class="tooltip tooltip-bottom"
                data-tip="Die App wird sich gleich neustarten"
            >
                <div
                    tabindex="0"
                    role="button"
                    class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6 pointer-events-none"
                >
                    Updatevorgang...
                </div>
            </div>
        {/if}
        {#await getVersion() then version}
            <span
                class="self-center text-base-content opacity-0 peer-hover:opacity-100 transition-opacity"
                >{version} {isDev ? "Development Build" : ""}
            </span>
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
                ><path
                    fill="var(--color-base-content)"
                    d="M19 13H5v-2h14z"
                /></svg
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
                    fill="var(--color-base-content)"
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
                    fill="var(--color-base-content)"
                    d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
                /></svg
            >
        </button>
    </div>
</div>
<dialog bind:this={theme_modal} class="modal scrollbar-gutter-affected">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Würfel</h3>
        <p class="text-sm text-base-content/60 mb-2">
            Alle sehen deine Würfel, wenn du würfelst.
        </p>
        <DiceSkinPicker />
        <h3 class="text-lg font-bold mt-4">Aussehen anpassen</h3>
        <div class="flex flex-row flex-wrap gap-1">
            {#each ["light", "dark", "cupcake", "bumblebee", "emerald", "corporate", "synthwave", "retro", "cyberpunk", "valentine", "halloween", "garden", "forest", "aqua", "lofi", "pastel", "fantasy", "wireframe", "black", "luxury", "dracula", "cmyk", "autumn", "business", "acid", "lemonade", "night", "coffee", "winter", "dim", "nord", "sunset", "caramellatte", "abyss", "silk"] as theme}
                <button
                    class="border-base-content/20 hover:border-base-content/40 overflow-hidden rounded-lg border outline-2 outline-offset-2 outline-transparent flex-1/3"
                    data-act-class="outline-base-content!"
                    onclick={() => {
                        appState.theme = theme;
                    }}
                >
                    <div
                        class="bg-base-100 text-base-content w-full cursor-pointer font-sans"
                        data-theme={theme}
                    >
                        <div class="grid grid-cols-5 grid-rows-3">
                            <div
                                class="bg-base-200 col-start-1 row-span-2 row-start-1"
                            ></div>
                            <div
                                class="bg-base-300 col-start-1 row-start-3"
                            ></div>
                            <div
                                class="bg-base-100 col-span-4 col-start-2 row-span-3 row-start-1 flex flex-col gap-1 p-2"
                            >
                                <div class="font-bold">{theme}</div>
                                <div class="flex flex-wrap gap-1">
                                    <div
                                        class="bg-primary flex aspect-square w-5 items-center justify-center rounded lg:w-6"
                                    >
                                        <div
                                            class="text-primary-content text-sm font-bold"
                                        >
                                            A
                                        </div>
                                    </div>
                                    <div
                                        class="bg-secondary flex aspect-square w-5 items-center justify-center rounded lg:w-6"
                                    >
                                        <div
                                            class="text-secondary-content text-sm font-bold"
                                        >
                                            A
                                        </div>
                                    </div>
                                    <div
                                        class="bg-accent flex aspect-square w-5 items-center justify-center rounded lg:w-6"
                                    >
                                        <div
                                            class="text-accent-content text-sm font-bold"
                                        >
                                            A
                                        </div>
                                    </div>
                                    <div
                                        class="bg-neutral flex aspect-square w-5 items-center justify-center rounded lg:w-6"
                                    >
                                        <div
                                            class="text-neutral-content text-sm font-bold"
                                        >
                                            A
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </button>
            {/each}
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>
{#if gameState.dm}
    <SceneDialog />
    <MarkerDialog />
    <MonsterDialog />
    <AssetBrowser />
    <UserAdminDialog />
    <dialog
        bind:this={modals.characterImportModal}
        class="modal scrollbar-gutter-affected"
    >
        <div class="modal-box">
            <h3 class="text-lg font-bold">Charakter importieren</h3>
            <fieldset class="fieldset">
                <legend class="fieldset-legend">Charakter-URL</legend>
                <input
                    type="text"
                    class="input w-full"
                    placeholder="https://www.dndbeyond.com/characters/xxxxxxxxx"
                    bind:value={character_url}
                />
                <p class="fieldset-label">
                    Es ist wichtig, dass der Charakter öffentlich gestellt ist
                </p>
                <legend class="fieldset-legend">Zugehöriger Spieler</legend>
                <select class="select w-full" bind:value={selected_player}>
                    <option value="" disabled>Spieler wählen</option>
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
{/if}
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
        background: color-mix(in srgb, var(--color-base-100), transparent 40%);
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
