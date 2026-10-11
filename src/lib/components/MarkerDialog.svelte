<script lang="ts">
    import { onMount } from "svelte";
    import { appState, dialogs } from "$lib/state.svelte";
    import { PutMarker } from "$lib/types/messaging/client_messages";
    import { MessageTypes, notify } from "$lib/notifications.svelte";
    import { file_stem_of, upload, uploadState } from "$lib/upload.svelte";
    import Marker from "./Marker.svelte";

    let dialog: HTMLDialogElement | null = $state(null);

    let marker_name = $state("");
    let marker_size = $state(1);
    let marker_file = $state("");

    function reset() {
        marker_name = "";
        marker_size = 1;
        marker_file = "";
    }

    /** Opens the dialog for a new marker. With a path, that file is uploaded as its image. */
    async function open(image_path?: string) {
        reset();
        if (image_path) marker_name = file_stem_of(image_path);
        dialog?.showModal();
        if (image_path) await upload_image(image_path);
    }

    onMount(() => {
        dialogs.marker = { open };
        return () => {
            dialogs.marker = null;
        };
    });

    async function upload_image(path?: string) {
        const asset = await upload(path);
        if (asset) marker_file = asset;
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
        reset();
        dialog?.close();
        notify("Marker erstellt", MessageTypes.Success, 3000);
    }
</script>

<dialog bind:this={dialog} class="modal scrollbar-gutter-affected">
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
                    disabled={uploadState.uploading}
                    onclick={() => {
                        upload_image();
                    }}
                >
                    {#if uploadState.uploading}
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
        <button class="outline-0" onclick={reset}>close</button>
    </form>
</dialog>
