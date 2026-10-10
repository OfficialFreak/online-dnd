<script lang="ts">
    let { children } = $props();
    import { getVersion } from "@tauri-apps/api/app";
    import "../app.css";
    import "@fortawesome/fontawesome-free/css/all.min.css";
    import { fileTypeFromBuffer } from "file-type";

    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { getCurrentWebview } from "@tauri-apps/api/webview";
    import { fileDropState } from "$lib/drag.svelte";
    import {
        gameState,
        appState,
        ensureStore,
        mouseX,
        mouseY,
        modals,
        get_own_character,
        resetGamestate,
    } from "../lib/state.svelte";
    import { connect } from "../lib/connection.svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { readFile } from "@tauri-apps/plugin-fs";
    import { fetch } from "@tauri-apps/plugin-http";
    import { onMount } from "svelte";
    import Map from "$lib/components/Map.svelte";
    import {
        ImportCharacter,
        InitialMessage,
        PutMarker,
        PutScene,
    } from "$lib/types/messaging/client_messages";
    import {
        EventType,
        MessageType,
        parseServerMessage,
    } from "$lib/types/messaging/server_messages";
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

    // Keep in sync with MAX_UPLOAD_SIZE in dnd-online-server/src/constants.rs
    const MAX_UPLOAD_MB = 50;

    let uploading = $state(false);

    /** Uploads a file and returns the asset name it is stored under, or null if the upload failed. */
    async function upload_file(
        selectedFilePath: string,
        selectedFileName: string,
    ): Promise<string | null> {
        if (!appState.token) {
            notify(
                "Hochladen fehlgeschlagen: Du bist nicht angemeldet.",
                MessageTypes.Error,
                5000,
            );
            return null;
        }

        // Read the file as binary
        let fileContent: Uint8Array;
        try {
            fileContent = await readFile(selectedFilePath);
        } catch (e) {
            console.error("Reading upload failed", e);
            notify(
                "Die Datei konnte nicht gelesen werden.",
                MessageTypes.Error,
                5000,
            );
            return null;
        }

        // Fail fast: the upload would be rejected anyway, and huge files are slow to hand over to Tauri
        if (fileContent.byteLength > MAX_UPLOAD_MB * 1_000_000) {
            notify(
                `Die Datei ist zu groß (maximal ${MAX_UPLOAD_MB} MB).`,
                MessageTypes.Error,
                8000,
            );
            return null;
        }

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
        let response: Response;
        try {
            response = await fetch(
                `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets?key=${encodeURIComponent(appState.token)}`,
                {
                    method: "POST",
                    body: formData,
                },
            );
        } catch (e) {
            console.error("Upload request failed", e);
            notify(
                "Hochladen fehlgeschlagen: Der Server ist nicht erreichbar.",
                MessageTypes.Error,
                8000,
            );
            return null;
        }

        if (!response.ok) {
            // The server answers with a message meant for the user
            const reason = await response.text().catch(() => "");
            console.error(
                `Upload failed: ${response.status} ${response.statusText}`,
                reason,
            );
            notify(
                reason
                    ? `Hochladen fehlgeschlagen: ${reason}`
                    : `Hochladen fehlgeschlagen (Fehler ${response.status}).`,
                MessageTypes.Error,
                8000,
            );
            return null;
        }

        const asset = await response.text().catch(() => "");
        if (!asset) {
            notify(
                "Hochladen fehlgeschlagen: Der Server hat keinen Dateinamen zurückgegeben.",
                MessageTypes.Error,
                8000,
            );
            return null;
        }
        return asset;
    }

    function file_name_of(path: string) {
        return path.split(/[/\\]/).pop() || "";
    }

    function file_stem_of(path: string) {
        return file_name_of(path).replace(/\.[^.]+$/, "");
    }

    /** Uploads a local file and returns its asset name, or null if it failed. */
    async function upload_path(path: string): Promise<string | null> {
        const file_name = file_name_of(path);
        if (!file_name) {
            notify("Ungültiger Dateiname", MessageTypes.Error, 3000);
            return null;
        }

        uploading = true;
        try {
            return await upload_file(path, file_name);
        } finally {
            uploading = false;
        }
    }

    /** Uploads a file for one of the creation dialogs. Without a path a file dialog is shown. */
    async function user_upload(
        image_use: "scene" | "background" | "marker",
        path?: string,
    ) {
        const selected = path ?? (await pick_file());
        // User canceled the selection
        if (selected === null) return;

        const asset = await upload_path(selected);
        if (!asset) return;

        if (image_use === "scene") {
            scene_file = asset;
        } else if (image_use === "marker") {
            marker_file = asset;
        } else {
            background_file = asset;
        }
    }

    async function pick_file() {
        return await open({
            multiple: false,
            filters: [
                {
                    name: "Bilder & Videos",
                    extensions: [
                        "png",
                        "jpg",
                        "jpeg",
                        "webp",
                        "gif",
                        "bmp",
                        "avif",
                        "mp4",
                        "webm",
                        "mov",
                        "mkv",
                    ],
                },
                { name: "Alle Dateien", extensions: ["*"] },
            ],
        });
    }

    /** Files dropped from the OS onto the marker or scene panel */
    async function handle_file_drop(target: string | null, paths: string[]) {
        if (!gameState.dm || paths.length === 0) return;

        if (target === "scenes") {
            reset_scene_vars();
            scene_name = file_stem_of(paths[0]);
            modals.sceneCreationModal?.showModal();
            await user_upload("scene", paths[0]);
        } else if (target === "markers" && paths.length === 1) {
            reset_marker_vars();
            marker_name = file_stem_of(paths[0]);
            modals.markerCreationModal?.showModal();
            await user_upload("marker", paths[0]);
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
                "Zieh Bilder auf das Marker- oder Szenen-Panel, um sie hochzuladen.",
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

    // The server stores these as integers and rejects anything else
    function to_int(value: unknown, fallback: number, min = -Infinity) {
        const number = Math.round(Number(value));
        return Number.isFinite(number) ? Math.max(number, min) : fallback;
    }

    async function create_scene() {
        if (!appState.ws || !scene_file) {
            return;
        }
        if (!scene_name.trim()) {
            notify("Bitte gib der Szene einen Namen", MessageTypes.Error, 3000);
            return;
        }

        // @ts-ignore
        await appState.ws.send(
            PutScene.create(
                scene_name.trim(),
                scene_file,
                background_file as string,
                to_int(background_blur, 10, 0),
                to_int(scene_columns, 10, 1),
                to_int(scene_rows, 10, 1),
                to_int(scene_x_offset, 0),
                to_int(scene_y_offset, 0),
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
        modals.sceneCreationModal?.close();
        notify("Szene erstellt", MessageTypes.Success, 3000);
    }

    async function create_marker() {
        if (!appState.ws || !marker_file) return;
        if (!marker_name.trim()) {
            notify("Bitte gib dem Marker einen Namen", MessageTypes.Error, 3000);
            return;
        }
        const size = Number(marker_size);

        await appState.ws.send(
            PutMarker.create(
                marker_name.trim(),
                marker_file,
                Number.isFinite(size) && size > 0 ? size : 1,
            ),
        );

        // Reset variables after
        reset_marker_vars();
        modals.markerCreationModal?.close();
        notify("Marker erstellt", MessageTypes.Success, 3000);
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
            try {
                await appState.ws.disconnect();
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
        try {
            await appState.ws?.disconnect();
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

    let mouse_timeout: any = $state(null);
    let large_mouse_timeout: any = $state(null);

    function choose(choices: string[]) {
        var index = Math.floor(Math.random() * choices.length);
        return choices[index];
    }

    $effect(() => {
        const ws = appState.ws;
        if (!ws) return;
        const unlisten = ws.addListener((msg) => {
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
                    notify(
                        `${message.sender}${message.sender_dm ? " 👑" : ""} hat ${message.single_dice ? "eine" : message.dices + " ="} ${message.result} gewürfelt${message.dm_only ? " [DM Only]" : ""}`,
                        MessageTypes.Info,
                        gameState.dm ? -1 : 5000,
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
                            sword_ping.play();
                        }
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
                        gameState.dm ? -1 : 5000,
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
                        gameState.dm ? -1 : 5000,
                    );
                    break;
                case MessageType.COMBAT_STATE:
                    gameState.combat = message.active;
                    break;
            }
        });
        // Request initial
        ws.send(InitialMessage.create());
        return unlisten;
    });

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


    let audio: HTMLAudioElement | null = $state(null);
    let sword_ping: HTMLAudioElement | null = $state(null);

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
        div.multiselect > ul.selected > li {
            display: flex;
            flex-direction: row;
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
        <h3 class="text-lg font-bold">Aussehen anpassen</h3>
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
    <dialog
        bind:this={modals.sceneCreationModal}
        class="modal scrollbar-gutter-affected">
        <div class="modal-box">
            <h3 class="text-lg font-bold">Szene erstellen</h3>
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
                        disabled={uploading}
                        onclick={() => {
                            user_upload("scene");
                        }}
                    >
                        {#if uploading}
                            <span class="loading loading-spinner"></span>
                            Wird hochgeladen…
                        {:else}
                            Map hochladen
                        {/if}
                    </button>
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
                            disabled={uploading}
                            onclick={() => {
                                user_upload("background");
                            }}
                        >
                            {#if uploading}
                                <span class="loading loading-spinner"></span>
                                Wird hochgeladen…
                            {:else}
                                Hintergrundbild hochladen
                            {/if}
                        </button>
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
                        <div
                            class="relative w-full h-30 pt-[30px] mt-4 overflow-hidden"
                        >
                            <BlurredBackground
                                file={background_file}
                                blur={background_blur}
                                position={"relative"}
                            />
                        </div>
                    {/if}

                    <button class="btn btn-neutral mt-4" onclick={create_scene}>
                        Scene erstellen
                    </button>
                    <p class="fieldset-label">
                        Du kannst Szenen überschreiben indem du eine Neue Szene
                        mit gleichem Namen erstellst.
                    </p>
                {/if}
            </fieldset>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button class="outline-0" onclick={reset_scene_vars}>close</button>
        </form>
    </dialog>
    <dialog
        bind:this={modals.characterImportModal}
        class="modal scrollbar-gutter-affected"
    >
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
    <dialog
        bind:this={modals.markerCreationModal}
        class="modal scrollbar-gutter-affected"
    >
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
                    Die Größe gibt an, wie viele Spalten (und somit auch Zeilen)
                    der Marker einnimmt.
                </p>

                {#if !marker_file}
                    <button
                        class="btn btn-neutral mt-4"
                        disabled={uploading}
                        onclick={() => {
                            user_upload("marker");
                        }}
                    >
                        {#if uploading}
                            <span class="loading loading-spinner"></span>
                            Wird hochgeladen…
                        {:else}
                            Marker-Bild
                        {/if}
                    </button>
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
                        Du kannst Marker überschreiben indem du einen neuen
                        Marker mit gleichem Namen erstellst.
                    </p>
                {/if}
            </fieldset>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button class="outline-0" onclick={reset_marker_vars}>close</button>
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
