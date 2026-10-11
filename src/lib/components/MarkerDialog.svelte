<script lang="ts">
    import { onMount } from "svelte";
    import { appState, dialogs, gameState } from "$lib/state.svelte";
    import {
        PutMarker,
        UpdateMarker,
    } from "$lib/types/messaging/client_messages";
    import type { MarkerTemplate } from "$lib/types/messaging/server_messages";
    import { MessageTypes, notify } from "$lib/notifications.svelte";
    import { file_stem_of, upload, uploadState } from "$lib/upload.svelte";
    import Marker from "./Marker.svelte";

    let dialog: HTMLDialogElement | null = $state(null);

    /** The marker being edited, null while creating a new one */
    let editing: MarkerTemplate | null = $state(null);

    let marker_name = $state("");
    let marker_size = $state(1);
    let marker_file = $state("");

    /** Another marker already has this name */
    let name_taken = $derived(
        gameState.markerLib.some(
            (marker) =>
                marker.name === marker_name.trim() &&
                marker.name !== editing?.name,
        ),
    );

    function reset() {
        editing = null;
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

    function edit(marker: MarkerTemplate) {
        reset();
        editing = marker;
        marker_name = marker.name;
        marker_size = marker.size;
        marker_file = marker.file;
        dialog?.showModal();
    }

    onMount(() => {
        dialogs.marker = { open, edit };
        return () => {
            dialogs.marker = null;
        };
    });

    async function upload_image(path?: string) {
        const asset = await upload(path);
        if (asset) marker_file = asset;
    }

    async function save_marker() {
        if (!appState.ws || !marker_file) return;
        const name = marker_name.trim();
        if (!name) {
            notify("Bitte gib dem Marker einen Namen", MessageTypes.Error, 3000);
            return;
        }
        const size = Number(marker_size);
        const valid_size = Number.isFinite(size) && size > 0 ? size : 1;

        if (editing) {
            if (name_taken) {
                notify(
                    "Ein anderer Marker hat schon diesen Namen",
                    MessageTypes.Error,
                    3000,
                );
                return;
            }
            await appState.ws.send(
                UpdateMarker.create(editing.name, name, marker_file, valid_size),
            );
            notify("Marker gespeichert", MessageTypes.Success, 3000);
        } else {
            await appState.ws.send(
                PutMarker.create(name, marker_file, valid_size),
            );
            notify(
                name_taken ? "Marker ersetzt" : "Marker erstellt",
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
            {editing ? "Marker bearbeiten" : "Marker erstellen"}
        </h3>
        <fieldset class="fieldset">
            <legend class="fieldset-legend">Markername</legend>
            <input
                type="text"
                bind:value={marker_name}
                class="input {name_taken
                    ? editing
                        ? 'input-error'
                        : 'input-warning'
                    : ''}"
                placeholder="Grom"
            />
            {#if name_taken}
                <p
                    class="fieldset-label {editing
                        ? 'text-error'
                        : 'text-warning'}"
                >
                    {editing
                        ? "Ein anderer Marker hat schon diesen Namen."
                        : "Einen Marker mit diesem Namen gibt es schon. Er wird ersetzt."}
                </p>
            {/if}
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
                <button
                    class="btn btn-sm btn-ghost self-start"
                    disabled={uploadState.uploading}
                    onclick={() => {
                        upload_image();
                    }}
                >
                    {#if uploadState.uploading}
                        <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                        <i class="fa-solid fa-arrow-up-from-bracket"></i>
                    {/if}
                    Anderes Bild hochladen
                </button>
                {#if editing}
                    <p class="fieldset-label">
                        Schon platzierte Marker bleiben, wie sie sind.
                    </p>
                {/if}
                <button
                    class="btn mt-4 {name_taken && !editing
                        ? 'btn-warning'
                        : 'btn-neutral'}"
                    disabled={(name_taken && !!editing) ||
                        uploadState.uploading}
                    onclick={save_marker}
                >
                    {editing
                        ? "Speichern"
                        : name_taken
                          ? "Marker ersetzen"
                          : "Marker erstellen"}
                </button>
            {/if}
        </fieldset>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0" onclick={reset}>close</button>
    </form>
</dialog>
