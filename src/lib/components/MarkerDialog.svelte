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
    import {
        openverse_suggestions,
        quick_suggestions,
        type Suggestion,
    } from "$lib/monster-images";
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
    /** Pictures to choose from, for a monster or the marker's name */
    let suggestions: Suggestion[] = $state([]);
    let finding_pictures = $state(false);
    /** The suggestion being uploaded, and the one that is the marker's picture */
    let choosing: string | null = $state(null);
    let chosen: string | null = $state(null);

    function reset() {
        opened++;
        for (const suggestion of suggestions) {
            if (suggestion.preview.startsWith("blob:")) URL.revokeObjectURL(suggestion.preview);
        }
        suggestions = [];
        finding_pictures = false;
        choosing = null;
        chosen = null;
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
            find_pictures(template.name ?? "", template.monster.type);
        }
    }

    /** Looks for pictures to choose from, the DM picks one or uploads their own */
    async function find_pictures(name: string, type: string | null) {
        if (!name.trim()) return;
        const this_opening = opened;
        finding_pictures = true;
        // The quick ones first, Openverse's come after a few seconds
        await Promise.allSettled([
            quick_suggestions(name.trim(), type).then((found) => {
                if (this_opening === opened) suggestions = [...found, ...suggestions];
            }),
            openverse_suggestions(name.trim()).then((found) => {
                if (this_opening === opened) suggestions = [...suggestions, ...found];
            }),
        ]);
        if (this_opening === opened) finding_pictures = false;
    }

    /** Uploads the chosen suggestion, only that one ends up on the server */
    async function choose(suggestion: Suggestion) {
        const this_opening = opened;
        choosing = suggestion.id;
        try {
            const picture = await suggestion.picture();
            const asset = await upload_bytes(picture.bytes, picture.file_name);
            if (this_opening !== opened || !asset) return;
            marker_file = asset;
            chosen = suggestion.id;
        } catch (e) {
            console.error("Loading the picture failed", e);
            notify("Das Bild ließ sich nicht laden", MessageTypes.Error, 3000);
        } finally {
            if (this_opening === opened) choosing = null;
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
        if (!asset) return;
        marker_file = asset;
        chosen = null;
    }

    async function pick_image() {
        const asset = await dialogs.assets?.pick(["image", "video"]);
        if (!asset) return;
        marker_file = asset;
        chosen = null;
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

            <legend class="fieldset-legend">Bild</legend>
            {#if finding_pictures}
                <div class="flex flex-row items-center gap-2 text-sm text-base-content/60">
                    <span class="loading loading-spinner loading-sm"></span>
                    {suggestions.length ? "Weitere Bilder werden gesucht…" : "Bilder werden gesucht…"}
                </div>
            {/if}
            {#if suggestions.length}
                <div class="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {#each suggestions as suggestion (suggestion.id)}
                        <button
                            type="button"
                            class="relative aspect-square rounded-box overflow-hidden bg-base-300 border-2 {chosen ===
                            suggestion.id
                                ? 'border-primary'
                                : 'border-transparent hover:border-base-content/30'}"
                            title={suggestion.label}
                            aria-label={suggestion.label}
                            disabled={choosing !== null}
                            onclick={() => choose(suggestion)}
                        >
                            <img
                                src={suggestion.preview}
                                alt=""
                                class="w-full h-full object-cover"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                            />
                            {#if choosing === suggestion.id}
                                <span
                                    class="absolute inset-0 grid place-items-center bg-base-100/60"
                                >
                                    <span class="loading loading-spinner"></span>
                                </span>
                            {/if}
                        </button>
                    {/each}
                </div>
                <p class="fieldset-label">
                    Tippe ein Bild an. Vorschläge aus dem Monsterhandbuch, das Symbol der
                    Kreaturart und freie Bilder von Openverse.
                </p>
            {/if}
            <div class="grid grid-cols-2 gap-2">
                <button
                    class="btn {marker_file ? 'btn-sm btn-soft' : 'btn-neutral'}"
                    disabled={uploadState.uploading}
                    onclick={() => {
                        upload_image();
                    }}
                >
                    {#if uploadState.uploading && choosing === null}
                        <span class="loading loading-spinner loading-xs"></span>
                        Wird hochgeladen…
                    {:else}
                        <i class="fa-solid fa-arrow-up-from-bracket"></i>
                        Eigenes hochladen
                    {/if}
                </button>
                <button
                    class="btn btn-soft {marker_file ? 'btn-sm' : ''}"
                    onclick={pick_image}
                >
                    <i class="fa-solid fa-folder-open"></i>
                    Aus den Dateien
                </button>
                {#if !suggestions.length && !finding_pictures && marker_name.trim()}
                    <button
                        class="btn btn-ghost btn-sm col-span-2"
                        onclick={() => find_pictures(marker_name, marker_monster?.type ?? null)}
                    >
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        Bilder zu „{marker_name.trim()}“ vorschlagen
                    </button>
                {/if}
            </div>
            {#if marker_file}
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
                    <p class="text-sm text-base-content/60">
                        So sieht der Marker aus.
                    </p>
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
