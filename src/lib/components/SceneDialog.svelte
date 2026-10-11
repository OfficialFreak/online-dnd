<script lang="ts">
    import { onMount } from "svelte";
    import { appState, dialogs } from "$lib/state.svelte";
    import { PutScene } from "$lib/types/messaging/client_messages";
    import { MessageTypes, notify } from "$lib/notifications.svelte";
    import { file_stem_of, upload, uploadState } from "$lib/upload.svelte";
    import BlurredBackground from "./BlurredBackground.svelte";
    import Map from "./Map.svelte";

    let dialog: HTMLDialogElement | null = $state(null);

    let scene_name: string = $state("");
    let scene_file: string | null = $state(null);
    let background_file: string | null = $state(null);
    let background_blur: number = $state(10);
    let scene_columns: number = $state(10);
    let scene_rows: number = $state(10);
    let scene_x_offset: number = $state(0);
    let scene_y_offset: number = $state(0);

    function reset() {
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

    onMount(() => {
        dialogs.scene = { open };
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
        reset();
        dialog?.close();
        notify("Szene erstellt", MessageTypes.Success, 3000);
    }
</script>

<dialog bind:this={dialog} class="modal scrollbar-gutter-affected">
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
        <button class="outline-0" onclick={reset}>close</button>
    </form>
</dialog>
