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
        set_controls_open,
        set_show_weather,
        set_motion,
    } from "../lib/state.svelte";
    import { connect } from "../lib/connection.svelte";
    import { in_tauri, invoke_tauri, listen_tauri } from "$lib/platform";
    import { file_stem_of, upload_path } from "$lib/upload.svelte";
    import {
        audioState,
        duck_music,
        effect_volume,
        guess_sound_kind,
        load_volume,
        music_progress,
        music_volume,
        play_effect,
        play_music,
        keep_unlocked,
        route_audio,
        set_audio_level,
        set_volume,
        stop_all_sounds,
        stop_effect,
        stop_music,
    } from "$lib/audio.svelte";
    import { onMount } from "svelte";
    import { fly } from "svelte/transition";
    import { keep_in_view } from "$lib/keep-in-view";
    import {
        ImportCharacter,
        InitialMessage,
        PutMarker,
        Ping,
        PutSound,
    } from "$lib/types/messaging/client_messages";
    import type { GameSocket } from "$lib/connection.svelte";
    import {
        EventType,
        MessageType,
        parseServerMessage,
        type AnyRoll,
    } from "$lib/types/messaging/server_messages";
    import { emoji_cannon } from "$lib/emoji-burst";
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
    import { condition_label, normalize_condition } from "$lib/conditions";
    import { load_dice_skin } from "$lib/dice-skins.svelte";
    import DiceSkinPicker from "$lib/components/DiceSkinPicker.svelte";
    import ReactionRecorder from "$lib/components/ReactionRecorder.svelte";
    import { hear_reaction, reactionState } from "$lib/reactions.svelte";
    import { goto } from "$app/navigation";
    import { updated } from "$app/state";
    import { Character } from "$lib/types/character";
    import { setActivity, start, stop } from "tauri-plugin-drpc";
    import { Activity, Assets, Timestamps } from "tauri-plugin-drpc/activity";

    let confetti_canvas: HTMLCanvasElement | null = $state(null);
    let pressure_burst: ReturnType<typeof emoji_cannon> | null = null;

    let isDev: boolean = $state(false);

    // Only the desktop app has a window of its own, a browser tab has its own buttons
    const appWindow = in_tauri ? getCurrentWindow() : null;
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
        // A tap on the dot takes the account back from another device
        taken_over = false;
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

    // A lost connection comes back on its own: after a server restart, a network hiccup,
    // or when a phone put the page to sleep. The retries wait longer each time.
    let retry_timer: ReturnType<typeof setTimeout> | undefined;
    let retry_delay = 1000;
    /**
     * The same account logged in on another device and this one was closed. Connecting
     * again on its own would throw the other one out, and so on, back and forth.
     */
    let taken_over = false;

    function retry_connection() {
        clearTimeout(retry_timer);
        if (taken_over) return;
        // A hidden page waits until it is shown again, a phone may not even run it
        if (!url || appState.ws || document.hidden) return;
        retry_timer = setTimeout(async () => {
            if (!url || appState.ws || reconnecting) return;
            reconnecting = true;
            const connected = await connect(url);
            reconnecting = false;
            if (connected) {
                retry_delay = 1000;
                notify("Wieder verbunden", MessageTypes.Success, 1500);
            } else {
                retry_delay = Math.min(retry_delay * 2, 15_000);
                retry_connection();
            }
        }, retry_delay);
    }

    let hidden_since = 0;
    /** Waiting for the server to answer a ping */
    let pong_waiters: (() => void)[] = [];

    /** Whether the connection still lives: the server answers a ping within 3 seconds */
    function alive(ws: GameSocket) {
        return new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), 3000);
            pong_waiters.push(() => {
                clearTimeout(timer);
                resolve(true);
            });
            ws.send(Ping.create()).catch(() => {
                clearTimeout(timer);
                resolve(false);
            });
        });
    }

    async function on_visibility_change() {
        if (document.hidden) {
            hidden_since = Date.now();
            return;
        }
        // A phone may keep the app open for days, a new version shows on return
        if (!in_tauri) updated.check().catch(() => {});
        if (!url || taken_over) return;
        retry_delay = 1000;
        if (!appState.ws) {
            retry_connection();
            return;
        }
        // iOS ends the connections of a page in the background, often without telling
        // it. After a while away the page asks the server, and only connects anew if it
        // doesn't answer: everyone else would see it leave and join again otherwise.
        if (
            !in_tauri &&
            Date.now() - hidden_since > 10_000 &&
            !(await alive(appState.ws))
        ) {
            if (!appState.ws || document.hidden) return;
            // First, so its close doesn't count as a lost connection
            const old_ws = appState.ws;
            appState.ws = null;
            try {
                await old_ws.disconnect();
            } catch {}
            retry_delay = 0;
            retry_connection();
        }
    }

    async function disconnect(evt: any) {
        evt.preventDefault();
        // First, so its close doesn't count as a lost connection
        const old_ws = appState.ws;
        appState.ws = null;
        resetGamestate();
        stop_all_sounds();
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
                stop_all_sounds();
                retry_delay = 1000;
                retry_connection();
            } else {
                // @ts-ignore
                console.log(`Received ${JSON.parse(msg.data).type}:`, msg);
            }
        });
    });

    // Folded away, the map reaches up under the dot and the button
    $effect(() => {
        html?.classList.toggle("controls-folded", !appState.controls_open);
    });

    $effect(() => {
        if (!appState.store || !html || !appState.theme) return;
        html?.setAttribute("data-theme", appState.theme);
        appState.store.set("theme", { value: appState.theme }).then(() => {
            appState.store.save();
        });
    });

    // Where the song is, to see whether everyone hears the same part
    let progress = $state<ReturnType<typeof music_progress>>(null);
    $effect(() => {
        if (!audioState.music) {
            progress = null;
            return;
        }
        const timer = setInterval(() => (progress = music_progress()), 1000);
        return () => clearInterval(timer);
    });

    function clock(seconds: number) {
        const whole = Math.floor(seconds);
        return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
    }

    // The desktop app lets WebView2 pass touchpad pinches on, which needs its zoom on. The
    // whole window must not zoom though, only the map does with Ctrl and the wheel or keys.
    if (in_tauri && typeof window !== "undefined") {
        window.addEventListener(
            "wheel",
            (event) => {
                if (event.ctrlKey) event.preventDefault();
            },
            { passive: false },
        );
        window.addEventListener(
            "keydown",
            (event) => {
                if (
                    (event.ctrlKey || event.metaKey) &&
                    [
                        "Equal",
                        "Minus",
                        "BracketRight",
                        "Slash",
                        "Digit0",
                        "NumpadAdd",
                        "NumpadSubtract",
                        "Numpad0",
                    ].includes(event.code)
                ) {
                    event.preventDefault();
                }
            },
            true,
        );
    }

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
        appState.controls_open =
            (
                (await appState.store.get("controls_open")) as
                    | { value: boolean }
                    | undefined
            )?.value ?? false;
        appState.show_weather =
            (
                (await appState.store.get("show_weather")) as
                    | { value: boolean }
                    | undefined
            )?.value ?? true;
        appState.motion =
            (
                (await appState.store.get("motion")) as
                    | { value: boolean }
                    | undefined
            )?.value ?? true;

        await load_volume();
        await load_dice_skin();
        audio = new Audio("speed.mp3");
        audio.loop = true;
        route_audio(audio);
        // The DM starts it for everyone, iOS plays it only once a tap unlocked it
        keep_unlocked(audio);

        sword_ping = new Audio("sword_sound.mp3");

        if (confetti_canvas) pressure_burst = emoji_cannon(confetti_canvas);

        if (!in_tauri && (navigator as { standalone?: boolean }).standalone) {
            check_home_screen_install();
        }

        // The rest is for the desktop app
        if (!in_tauri) return;

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
        isDev = (await invoke_tauri<boolean>("is_dev")) ?? false;
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

    /**
     * A home screen install from before the opaque status bar keeps the translucent one:
     * iOS reads it only when the app is added. iOS 26 blurs the top of such an app and
     * makes it shorter than the screen. With the opaque one the app starts below the
     * status bar and gets no inset at the top.
     */
    function check_home_screen_install() {
        const probe = document.createElement("div");
        probe.style.cssText =
            "position: fixed; top: 0; padding-top: env(safe-area-inset-top); visibility: hidden; pointer-events: none";
        document.body.append(probe);
        const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
        probe.remove();
        if (inset > 0) {
            notify(
                "Diese App ist noch mit einer alten Einstellung auf dem Home-Bildschirm: oben verschwommen, unten zu kurz. Lösch sie vom Home-Bildschirm und füg sie in Safari über Teilen → „Zum Home-Bildschirm“ neu hinzu.",
                MessageTypes.Warning,
                0,
            );
            return;
        }
        // Held sideways the status bar is hidden and has no inset, upright it shows
        const portrait = matchMedia("(orientation: portrait)");
        if (portrait.matches) return;
        portrait.addEventListener("change", check_home_screen_install, {
            once: true,
        });
    }

    function setDiscordStatus(message: string, dev: boolean) {
        if (!in_tauri) return;
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
                            taken_over = true;
                            notify(
                                `Du hast dich von einem anderen Gerät eingeloggt. Tipp auf den roten Punkt oben, um hier weiterzuspielen.`,
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
                        ws.send(InitialMessage.create(!in_tauri));
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
                        play_music(
                            message.name,
                            message.file,
                            message.started_at,
                            message.sent_at,
                        );
                    } else {
                        play_effect(message.name, message.file);
                    }
                    break;
                case MessageType.STOP_MUSIC:
                    stop_music();
                    break;
                case MessageType.STOP_SOUND:
                    stop_effect(message.name);
                    break;
                case MessageType.WEATHER:
                    if (gameState.scene) gameState.scene.weather = message.weather;
                    break;
                case MessageType.PONG:
                    pong_waiters.splice(0).forEach((answered) => answered());
                    break;
                case MessageType.REACTION:
                    hear_reaction(message);
                    break;
                case MessageType.REACTIONS:
                    reactionState.mine = message.reactions ?? {};
                    break;
                case MessageType.DOOR: {
                    const door = gameState.scene?.state.doors?.find(
                        (door) => door.id === message.id,
                    );
                    if (door) {
                        door.open = message.open;
                        door.locked = message.locked;
                    }
                    break;
                }
                case MessageType.EFFECTS_ENDED: {
                    const labels = message.effects.map(condition_label);
                    notify(
                        `${message.marker}: ${labels.join(", ")} ${labels.length > 1 ? "enden" : "endet"}`,
                        MessageTypes.Info,
                        6000,
                    );
                    break;
                }
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
                case MessageType.MOUSE_POSITION:
                    show_pointer(message.user, message.x, message.y);
                    break;
                case MessageType.MARKER_POSITION:
                    move_marker_live(message.marker_name, message.x, message.y);
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
        ws.send(InitialMessage.create(!in_tauri));
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
        if (audio) set_audio_level(audio, music_volume());
    });

    $effect(() => {
        if (!audio) return;
        // The pressure music would play over the DM's music
        duck_music(gameState.pressure);
        if (gameState.pressure) {
            // Browsers may refuse sound before the first tap on the page
            audio.play().catch((e) => console.error("Playing the pressure music failed", e));
            let duration = 15 * 1000;
            let end = Date.now() + duration;
            let last = 0;
            // Smaller on smaller screens, big they covered a tablet
            const size = Math.min(32, Math.max(18, window.innerWidth / 50));

            (function frame() {
                if (Date.now() < end && gameState.pressure) {
                    requestAnimationFrame(frame);
                }
                // As many as at 60 frames a second, phones and tablets draw up to 120
                if (Date.now() - last < 15) return;
                last = Date.now();
                for (const [angle, x] of [
                    [60, 0],
                    [120, 1],
                ]) {
                    pressure_burst?.({
                        emojis: ["⏱️", "⌚"],
                        count: 2,
                        angle,
                        spread: 55,
                        size,
                        origin: { x, y: 0.5 },
                    });
                }
            })();
        } else {
            audio.pause();
        }
    });

    let updating = $state(false);

    listen_tauri("update-started", () => {
        updating = true;
    });

    listen_tauri<string>("backend-error", (payload) => {
        notify(payload, MessageTypes.Error, 0);
        console.log(`Backend Error: ${payload}`);
    });

    listen_tauri<string>("backend-debug", (payload) => {
        console.log(`Backend Debug: ${payload}`);
    });

    /** A live position over QUIC in the desktop app, over the WebSocket in a browser */
    function move_marker_live(marker_name: string, x: number, y: number) {
        // The marker may be gone already, e.g. after a scene switch mid-drag
        const marker = gameState.scene?.state.markers.find(
            (marker) => marker.name === marker_name,
        );
        if (!marker) return;
        marker.x.target = x;
        marker.y.target = y;
    }

    listen_tauri<{ x: number; y: number; name: string }>(
        "mouse-position",
        // Without a name it comes from an older client
        (payload) => show_pointer(payload.name, payload.x, payload.y),
    );

    listen_tauri<{ x: number; y: number; marker_name: string }>(
        "marker-position",
        (payload) => move_marker_live(payload.marker_name, payload.x, payload.y),
    );

    invoke_tauri("frontend_ready");

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

<svelte:document onvisibilitychange={on_visibility_change} />

<svelte:window
    ononline={() => {
        retry_delay = 0;
        retry_connection();
    }}
    onbeforeunload={async () => {
        await appState.ws?.disconnect();
        if (in_tauri) await stop();
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

<!-- Without the controls only the dot and the button stay, the bar itself disappears -->
<div
    data-tauri-drag-region
    class="titlebar z-10 {appState.controls_open ? '' : 'titlebar-folded'}"
>
    <div class="flex justify-center transition-opacity gap-2">
        <button
            onclick={reconnect}
            oncontextmenu={disconnect}
            aria-label="Reconnect"
            class="cursor-pointer peer -mr-2"
        >
            <div
                class="h-[var(--titlebar)] w-[var(--titlebar)] flex justify-center items-center"
            >
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
        <!-- Folds the controls away and back, only a tap on it does -->
        <button
            class="h-[var(--titlebar)] w-11 pointer-coarse:w-14 flex justify-center items-center rounded-field cursor-pointer transition-colors hover:bg-base-content/10 {appState.controls_open
                ? 'text-primary'
                : 'text-base-content/80'}"
            aria-label={appState.controls_open
                ? "Steuerung einklappen"
                : "Steuerung ausklappen"}
            title={appState.controls_open
                ? "Steuerung einklappen"
                : "Steuerung ausklappen"}
            aria-expanded={appState.controls_open}
            onclick={() => set_controls_open(!appState.controls_open)}
        >
            <!-- A shadow instead of a background, readable over a light map too -->
            <i
                class="fa-solid fa-sliders pointer-coarse:text-lg drop-shadow-[0_1px_2px_rgb(0_0_0/0.7)]"
            ></i>
        </button>
        {#if appState.controls_open}
        <div
            class="flex gap-2"
            transition:fly={{ x: -12, duration: 150 }}
        >
        {#if gameState.dm}
            <div
                class="btn btn-soft btn-info !text-xs px-2 my-auto h-6 pointer-coarse:h-9 pointer-coarse:px-3 pointer-coarse:!text-sm pointer-events-none"
            >
                DM
            </div>
        {/if}
        <button
            class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6 pointer-coarse:h-9 pointer-coarse:px-3 pointer-coarse:!text-sm"
            aria-label="Aussehen"
            onclick={() => theme_modal?.showModal()}
            ><i class="fa-solid fa-palette"></i><span class="max-sm:hidden"
                >Aussehen</span
            ></button
        >
        {#if gameState.dm}
            <button
                class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6 pointer-coarse:h-9 pointer-coarse:px-3 pointer-coarse:!text-sm"
                onclick={() => dialogs.users?.open()}
            >
                <i class="fa-solid fa-users-gear"></i>
                <!-- Only the icons on a phone, the bar wouldn't fit across -->
                <span class="max-sm:hidden">Spieler</span>
            </button>
            <button
                class="btn btn-soft btn-primary !text-xs px-2 my-auto h-6 pointer-coarse:h-9 pointer-coarse:px-3 pointer-coarse:!text-sm"
                onclick={() => dialogs.assets?.open()}
            >
                <i class="fa-solid fa-folder-open"></i>
                <span class="max-sm:hidden">Dateien</span>
            </button>
        {/if}
        <!-- Flex, as a block the button would sit on the text baseline, lower than the others -->
        <div class="dropdown dropdown-bottom my-auto flex">
            <button
                tabindex="0"
                class="btn btn-soft btn-primary !text-xs px-2 h-6 pointer-coarse:h-9 pointer-coarse:px-3 pointer-coarse:!text-sm"
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
            <!-- On a phone the button sits near the right edge, the menu moves into view -->
            <div
                tabindex="-1"
                class="dropdown-content bg-base-100 rounded-box z-20 w-60 p-3 shadow-sm flex flex-col gap-2"
                style="transform: translate(var(--shift-x, 0px), var(--shift-y, 0px))"
                use:keep_in_view
            >
                {#if audioState.music}
                    <p class="text-sm truncate">
                        <i class="fa-solid fa-music"></i>
                        {audioState.music.name}
                    </p>
                    {#if progress}
                        <p class="text-xs opacity-70 tabular-nums">
                            {clock(progress.position)} /
                            {progress.length === null
                                ? "?"
                                : (progress.guessed ? "~" : "") + clock(progress.length)}
                            {#if progress.paused}· pausiert{/if}
                            {#if progress.seeking}· springt{/if}
                            {#if progress.expected !== null && progress.off !== null && progress.off > 2}
                                (soll {clock(progress.expected)})
                            {/if}
                        </p>
                    {/if}
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
        </div>
        {/if}
        {#if updating}
            <div
                class="tooltip tooltip-bottom my-auto flex"
                data-tip="Die App wird sich gleich neustarten"
            >
                <div
                    tabindex="0"
                    role="button"
                    class="btn btn-soft btn-primary !text-xs px-2 h-6 pointer-coarse:h-9 pointer-events-none"
                >
                    Updatevorgang...
                </div>
            </div>
        {/if}
        {#if in_tauri}
            {#await getVersion() then version}
                <span
                    class="self-center text-base-content opacity-0 peer-hover:opacity-100 transition-opacity"
                    >{version} {isDev ? "Development Build" : ""}
                </span>
            {/await}
        {/if}
    </div>

    {#if appWindow}
        <div class="flex justify-center transition-opacity">
            <button
                class="titlebar-button"
                id="titlebar-minimize"
                onclick={() => appWindow.minimize()}
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
                onclick={() => appWindow.toggleMaximize()}
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
                onclick={() => appWindow.close()}
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
    {/if}
</div>
<dialog bind:this={theme_modal} class="modal scrollbar-gutter-affected">
    <div class="modal-box">
        <h3 class="text-lg font-bold">Würfel</h3>
        <p class="text-sm text-base-content/60 mb-2">
            Alle sehen deine Würfel, wenn du würfelst.
        </p>
        <DiceSkinPicker />
        <h3 class="text-lg font-bold mt-4">Reaktionen</h3>
        <p class="text-sm text-base-content/60 mb-2">
            Sprich sie mit deiner Stimme ein, bis zu 3 Sekunden. Alle hören sie, wenn
            du sie neben den Würfeln drückst.
        </p>
        <ReactionRecorder />
        <h3 class="text-lg font-bold mt-4">Effekte</h3>
        <label class="flex items-center gap-2 text-sm mt-1">
            <input
                type="checkbox"
                class="toggle toggle-sm"
                checked={appState.show_weather}
                onchange={(event) =>
                    set_show_weather(event.currentTarget.checked)}
            />
            Regen, Schnee und Nebel auf der Karte zeigen
        </label>
        <label class="flex items-center gap-2 text-sm mt-1">
            <input
                type="checkbox"
                class="toggle toggle-sm"
                checked={appState.motion}
                onchange={(event) => set_motion(event.currentTarget.checked)}
            />
            Bewegte Zustände: Glühen, Funken, Flammen
        </label>
        <p class="text-xs text-base-content/60 mt-1">
            Ruckelt die App, schalte das aus, es lässt die Grafik ständig arbeiten.
        </p>
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
    class="fixed bottom-[var(--safe-bottom)] left-0 pr-[var(--safe-right)] w-screen z-[9999] overflow-hidden scrollbar-gutter-affected flex justify-end pointer-events-none"
>
    <div
        class="w-80 p-2 pointer-events-none flex flex-col justify-end items-end gap-1"
    >
        <Notifications />
    </div>
</div>
<!-- The desktop app updates itself, the web version runs on until it is reloaded -->
{#if !in_tauri && updated.current}
    <button
        class="btn btn-info btn-sm fixed left-1/2 -translate-x-1/2 top-[calc(var(--titlebar)+var(--safe-top)+0.5rem)] z-[9999] shadow-lg"
        transition:fly={{ y: -10, duration: 200 }}
        onclick={() => location.reload()}
    >
        <i class="fa-solid fa-rotate"></i> Neue Version, neu laden
    </button>
{/if}

{@render children()}

<style>
    .titlebar {
        height: calc(var(--titlebar) + var(--safe-top));
        padding: var(--safe-top) var(--safe-right) 0 var(--safe-left);
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
        transition:
            background-color 0.2s,
            box-shadow 0.2s,
            border-color 0.2s,
            backdrop-filter 0.2s;
    }
    .titlebar-folded {
        background: transparent;
        box-shadow: none;
        border-color: transparent;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
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
