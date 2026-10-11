<script lang="ts">
    import { onMount } from "svelte";
    import { appState, dialogs, gameState } from "$lib/state.svelte";
    import {
        PutMarker,
        UpdateMarker,
    } from "$lib/types/messaging/client_messages";
    import type { MarkerTemplate } from "$lib/types/messaging/server_messages";
    import type { MonsterInfo } from "$lib/monsters";
    import { MessageTypes, notify } from "$lib/notifications.svelte";
    import {
        file_stem_of,
        upload,
        upload_bytes,
        uploadState,
    } from "$lib/upload.svelte";
    import { monster_picture } from "$lib/monster-images";
    import Marker from "./Marker.svelte";

    let dialog: HTMLDialogElement | null = $state(null);

    /** The marker being edited, null while creating a new one */
    let editing: MarkerTemplate | null = $state(null);

    let marker_name = $state("");
    let marker_size = $state(1);
    let marker_file = $state("");
    let marker_max_hp: number | null = $state(null);
    /** The monster from Open5e the marker is made from */
    let marker_monster: MonsterInfo | null = $state(null);

    /** Another marker already has this name */
    let name_taken = $derived(
        gameState.markerLib.some(
            (marker) =>
                marker.name === marker_name.trim() &&
                marker.name !== editing?.name,
        ),
    );

    /** Counts the times the dialog opened, a picture found for an earlier marker is dropped */
    let opened = 0;
    let finding_picture = $state(false);

    function reset() {
        opened++;
        finding_picture = false;
        editing = null;
        marker_name = "";
        marker_size = 1;
        marker_file = "";
        marker_max_hp = null;
        marker_monster = null;
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
        marker_max_hp = marker.max_hp ?? null;
        marker_monster = marker.monster ?? null;
        dialog?.showModal();
    }

    /** Opens the dialog for a new marker with these values, e.g. from a monster */
    function create_from(template: Partial<MarkerTemplate>) {
        reset();
        marker_name = template.name ?? "";
        marker_size = template.size ?? 1;
        marker_max_hp = template.max_hp ?? null;
        marker_monster = template.monster ?? null;
        dialog?.showModal();
        if (template.monster) {
            find_picture(template.name ?? "", template.monster.type);
        }
    }

    /** Puts the monster's picture on the server, or a token for its creature type */
    async function find_picture(name: string, type: string) {
        const this_opening = opened;
        finding_picture = true;
        try {
            const picture = await monster_picture(name, type);
            if (this_opening !== opened) return;
            const asset = await upload_bytes(picture.bytes, picture.file_name);
            // Unless the DM chose another one meanwhile
            if (this_opening === opened && asset && !marker_file) {
                marker_file = asset;
            }
        } catch (e) {
            console.error("Making the monster's picture failed", e);
        } finally {
            if (this_opening === opened) finding_picture = false;
        }
    }

    onMount(() => {
        dialogs.marker = { open, edit, create_from };
        return () => {
            dialogs.marker = null;
        };
    });

    async function upload_image(path?: string) {
        const asset = await upload(path);
        if (asset) marker_file = asset;
    }

    async function pick_image() {
        const asset = await dialogs.assets?.pick(["image", "video"]);
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
        const max_hp = Math.round(Number(marker_max_hp));
        const valid_max_hp = max_hp > 0 ? max_hp : null;

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
                UpdateMarker.create(
                    editing.name,
                    name,
                    marker_file,
                    valid_size,
                    valid_max_hp,
                    marker_monster,
                ),
            );
            notify("Marker gespeichert", MessageTypes.Success, 3000);
        } else {
            await appState.ws.send(
                PutMarker.create(
                    name,
                    marker_file,
                    valid_size,
                    valid_max_hp,
                    marker_monster,
                ),
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
                class="input w-full {name_taken
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
            {#if marker_monster}
                <p class="fieldset-label">
                    <i class="fa-solid fa-dragon"></i>
                    {marker_monster.type} · RK {marker_monster.armor_class} · HG
                    {marker_monster.challenge_rating}
                    <button
                        class="link"
                        onclick={() =>
                            marker_monster &&
                            dialogs.monster?.show(marker_monster.key)}
                        >Werte</button
                    >
                </p>
            {/if}
            <legend class="fieldset-legend">Größe</legend>
            <input
                type="number"
                bind:value={marker_size}
                class="input w-full"
                placeholder="1"
            />
            <p class="fieldset-label">
                Die Größe gibt an, wie viele Spalten (und somit auch Zeilen)
                der Marker einnimmt.
            </p>
            <legend class="fieldset-legend">Trefferpunkte</legend>
            <input
                type="number"
                min="1"
                bind:value={marker_max_hp}
                class="input w-full"
                placeholder="Optional"
            />
            <p class="fieldset-label">
                Platzierte Marker starten damit. Nur DMs sehen die
                Trefferpunkte.
            </p>

            {#if !marker_file && finding_picture}
                <div
                    class="flex flex-row items-center gap-2 mt-4 text-sm text-base-content/60"
                >
                    <span class="loading loading-spinner loading-sm"></span>
                    Bild des Monsters wird geholt…
                </div>
            {:else if !marker_file}
                <div class="grid grid-cols-2 gap-2 mt-4">
                    <button
                        class="btn btn-neutral"
                        disabled={uploadState.uploading}
                        onclick={() => {
                            upload_image();
                        }}
                    >
                        {#if uploadState.uploading}
                            <span class="loading loading-spinner"></span>
                            Wird hochgeladen…
                        {:else}
                            <i class="fa-solid fa-arrow-up-from-bracket"></i>
                            Marker-Bild
                        {/if}
                    </button>
                    <button class="btn btn-soft" onclick={pick_image}>
                        <i class="fa-solid fa-folder-open"></i>
                        Aus den Dateien
                    </button>
                </div>
            {:else}
                <div class="flex flex-row items-center gap-4 mt-2">
                    <div class="w-28 shrink-0">
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
                    </div>
                    <div class="flex-1 flex flex-col gap-2">
                        <button
                            class="btn btn-sm btn-soft"
                            disabled={uploadState.uploading}
                            onclick={() => {
                                upload_image();
                            }}
                        >
                            {#if uploadState.uploading}
                                <span class="loading loading-spinner loading-xs"
                                ></span>
                            {:else}
                                <i class="fa-solid fa-arrow-up-from-bracket"
                                ></i>
                            {/if}
                            Anderes Bild hochladen
                        </button>
                        <button class="btn btn-sm btn-soft" onclick={pick_image}>
                            <i class="fa-solid fa-folder-open"></i>
                            Anderes Bild aus den Dateien
                        </button>
                    </div>
                </div>
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
