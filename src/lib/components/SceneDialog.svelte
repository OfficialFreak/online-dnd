<script lang="ts">
    import { onMount } from "svelte";
    import { appState, dialogs, gameState } from "$lib/state.svelte";
    import {
        PutScene,
        UpdateScene,
    } from "$lib/types/messaging/client_messages";
    import type { Scene } from "$lib/types/messaging/server_messages";
    import { MessageTypes, notify } from "$lib/notifications.svelte";
    import { file_stem_of, upload, uploadState } from "$lib/upload.svelte";
    import BlurredBackground from "./BlurredBackground.svelte";
    import Map from "./Map.svelte";

    let dialog: HTMLDialogElement | null = $state(null);

    /** The scene being edited, null while creating a new one */
    let editing: Scene | null = $state(null);

    let scene_name: string = $state("");
    let scene_file: string | null = $state(null);
    let background_file: string | null = $state(null);
    let background_blur: number = $state(10);
    let scene_columns: number = $state(10);
    let scene_rows: number = $state(10);
    let scene_x_offset: number = $state(0);
    let scene_y_offset: number = $state(0);

    /** Another scene already has this name */
    let name_taken = $derived(
        gameState.scenes.some(
            (scene) =>
                scene.name === scene_name.trim() &&
                scene.name !== editing?.name,
        ),
    );

    function reset() {
        editing = null;
        scene_name = "";
        scene_file = null;
        background_file = null;
        background_blur = 10;
        scene_columns = 10;
        scene_x_offset = 0;
        scene_y_offset = 0;
    }

    /** Opens the dialog for a new scene. With a path, that file is uploaded as its map. */
    async function open(map_path?: string) {
        reset();
        if (map_path) scene_name = file_stem_of(map_path);
        dialog?.showModal();
        if (map_path) await upload_map(map_path);
    }

    function edit(scene: Scene) {
        reset();
        editing = scene;
        scene_name = scene.name;
        scene_file = scene.map_file;
        background_file = scene.background_file ?? null;
        background_blur = scene.background_blur ?? 10;
        scene_columns = scene.columns;
        scene_rows = scene.rows;
        scene_x_offset = scene.x_offset;
        scene_y_offset = scene.y_offset;
        dialog?.showModal();
    }

    onMount(() => {
        dialogs.scene = { open, edit };
        return () => {
            dialogs.scene = null;
        };
    });

    async function upload_map(path?: string) {
        const asset = await upload(path);
        if (asset) scene_file = asset;
    }

    async function upload_background() {
        const asset = await upload();
        if (asset) background_file = asset;
    }

    // The server stores these as integers and rejects anything else
    function to_int(value: unknown, fallback: number, min = -Infinity) {
        const number = Math.round(Number(value));
        return Number.isFinite(number) ? Math.max(number, min) : fallback;
    }

    async function save_scene() {
        if (!appState.ws || !scene_file) {
            return;
        }
        const name = scene_name.trim();
        if (!name) {
            notify("Bitte gib der Szene einen Namen", MessageTypes.Error, 3000);
            return;
        }

        const columns = to_int(scene_columns, 10, 1);
        // The rows are measured on the preview, which may not have loaded yet. They only
        // change with the map or the columns, and the fog is adjusted to them.
        const rows =
            editing &&
            scene_file === editing.map_file &&
            columns === editing.columns
                ? editing.rows
                : to_int(scene_rows, 10, 1);
        const settings = [
            name,
            scene_file,
            background_file,
            to_int(background_blur, 10, 0),
            columns,
            rows,
            to_int(scene_x_offset, 0),
            to_int(scene_y_offset, 0),
        ] as const;

        if (editing) {
            if (name_taken) {
                notify(
                    "Eine andere Szene hat schon diesen Namen",
                    MessageTypes.Error,
                    3000,
                );
                return;
            }
            await appState.ws.send(UpdateScene.create(editing.name, ...settings));
            notify("Szene gespeichert", MessageTypes.Success, 3000);
        } else {
            await appState.ws.send(
                PutScene.create(...settings, {
                    fog_squares: {},
                    markers: [],
                    initiative: [],
                    turn: null,
                }),
            );
            notify(
                name_taken ? "Szene ersetzt" : "Szene erstellt",
                MessageTypes.Success,
                3000,
            );
        }

        reset();
        dialog?.close();
    }
</script>

<dialog bind:this={dialog} class="modal scrollbar-gutter-affected">
    <div class="modal-box">
        <h3 class="text-lg font-bold">
            {editing ? "Szene bearbeiten" : "Szene erstellen"}
        </h3>
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Szenenname</legend>
            <input
                type="text"
                bind:value={scene_name}
                class="input {name_taken
                    ? editing
                        ? 'input-error'
                        : 'input-warning'
                    : ''}"
                placeholder="Goblinlager"
            />
            {#if name_taken}
                <p
                    class="fieldset-label {editing
                        ? 'text-error'
                        : 'text-warning'}"
                >
                    {editing
                        ? "Eine andere Szene hat schon diesen Namen."
                        : "Eine Szene mit diesem Namen gibt es schon. Sie wird samt Markern und Nebel ersetzt."}
                </p>
            {/if}

            {#if !scene_file}
                <button
                    class="btn btn-neutral mt-4"
                    disabled={uploadState.uploading}
                    onclick={() => {
                        upload_map();
                    }}
                >
                    {#if uploadState.uploading}
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
                {#if editing && to_int(scene_columns, 10, 1) !== editing.columns}
                    <p class="fieldset-label">
                        Der Nebel wird an das neue Raster angepasst.
                    </p>
                {/if}

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
                <button
                    class="btn btn-sm btn-ghost self-start"
                    disabled={uploadState.uploading}
                    onclick={() => {
                        upload_map();
                    }}
                >
                    {#if uploadState.uploading}
                        <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                        <i class="fa-solid fa-arrow-up-from-bracket"></i>
                    {/if}
                    Andere Map hochladen
                </button>

                {#if !background_file}
                    <button
                        class="btn btn-neutral mt-4"
                        disabled={uploadState.uploading}
                        onclick={() => {
                            upload_background();
                        }}
                    >
                        {#if uploadState.uploading}
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
                    <div class="flex flex-row gap-1">
                        <button
                            class="btn btn-sm btn-ghost"
                            disabled={uploadState.uploading}
                            onclick={() => {
                                upload_background();
                            }}
                        >
                            <i class="fa-solid fa-arrow-up-from-bracket"></i>
                            Anderes Hintergrundbild
                        </button>
                        <button
                            class="btn btn-sm btn-ghost"
                            onclick={() => (background_file = null)}
                        >
                            <i class="fa-solid fa-xmark"></i>
                            Entfernen
                        </button>
                    </div>
                {/if}

                <button
                    class="btn mt-4 {name_taken && !editing
                        ? 'btn-warning'
                        : 'btn-neutral'}"
                    disabled={(name_taken && !!editing) ||
                        uploadState.uploading}
                    onclick={save_scene}
                >
                    {editing
                        ? "Speichern"
                        : name_taken
                          ? "Szene ersetzen"
                          : "Szene erstellen"}
                </button>
            {/if}
        </fieldset>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0" onclick={reset}>close</button>
    </form>
</dialog>
