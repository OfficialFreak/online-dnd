<script lang="ts">
    import { onMount } from "svelte";
    import { appState, assetState, dialogs } from "$lib/state.svelte";
    import {
        DeleteAsset,
        ListAssets,
    } from "$lib/types/messaging/client_messages";
    import { asset_kind, asset_title, type AssetKind } from "$lib/assets";
    import Display from "./Display.svelte";

    let dialog: HTMLDialogElement | null = $state(null);

    type Filter = "all" | AssetKind | "unused";
    let filter: Filter = $state("all");
    let search = $state("");
    let confirm_delete: string | null = $state(null);

    /** While picking, choosing a file hands it to whoever asked for it */
    let picking: ((asset: string | null) => void) | null = $state(null);
    let pick_kinds: AssetKind[] = $state([]);

    let assets = $derived(
        assetState.assets
            .filter((asset) => {
                const kind = asset_kind(asset.name);
                if (picking && !pick_kinds.includes(kind)) return false;
                if (filter === "unused") return !asset.used;
                return filter === "all" || kind === filter;
            })
            .filter((asset) =>
                asset_title(asset.name)
                    .toLowerCase()
                    .includes(search.trim().toLowerCase()),
            )
            .toSorted((a, b) => (b.modified ?? 0) - (a.modified ?? 0)),
    );

    let unused_size = $derived(
        assetState.assets
            .filter((asset) => !asset.used)
            .reduce((sum, asset) => sum + asset.size, 0),
    );

    function load() {
        appState.ws?.send(ListAssets.create());
    }

    function open() {
        finish_pick(null);
        filter = "all";
        load();
        dialog?.showModal();
    }

    /** Lets the DM choose an uploaded file, null if they close the browser */
    function pick(kinds: AssetKind[]): Promise<string | null> {
        finish_pick(null);
        filter = "all";
        pick_kinds = kinds;
        load();
        dialog?.showModal();
        return new Promise((resolve) => {
            picking = resolve;
        });
    }

    function finish_pick(asset: string | null) {
        picking?.(asset);
        picking = null;
    }

    onMount(() => {
        dialogs.assets = { open, pick };
        return () => {
            dialogs.assets = null;
        };
    });

    function choose(name: string) {
        if (!picking) return;
        finish_pick(name);
        dialog?.close();
    }

    function request_delete(name: string) {
        if (confirm_delete === name) {
            confirm_delete = null;
            appState.ws?.send(DeleteAsset.create(name));
            return;
        }
        confirm_delete = name;
        setTimeout(() => {
            if (confirm_delete === name) confirm_delete = null;
        }, 3000);
    }

    function megabytes(bytes: number) {
        return `${(bytes / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
    }

    const FILTERS: [Filter, string][] = [
        ["all", "Alle"],
        ["image", "Bilder"],
        ["video", "Videos"],
        ["audio", "Audio"],
        ["unused", "Unbenutzt"],
    ];
</script>

<dialog
    bind:this={dialog}
    class="modal scrollbar-gutter-affected"
    onclose={() => finish_pick(null)}
>
    <div class="modal-box w-11/12 max-w-5xl flex flex-col gap-2 max-h-[85vh]">
        <h3 class="text-lg font-bold">
            {picking ? "Datei auswählen" : "Dateien"}
        </h3>
        <div class="flex flex-row flex-wrap gap-2 items-center">
            <label class="input input-sm w-56">
                <i class="fa-solid fa-magnifying-glass opacity-50"></i>
                <input type="search" placeholder="Suchen" bind:value={search} />
            </label>
            {#if !picking}
                <div class="join">
                    {#each FILTERS as [value, label]}
                        <button
                            class="btn btn-sm join-item {filter === value
                                ? 'btn-info'
                                : ''}"
                            onclick={() => (filter = value)}>{label}</button
                        >
                    {/each}
                </div>
                {#if unused_size > 0}
                    <span class="text-sm text-base-content/60">
                        Unbenutzte Dateien belegen {megabytes(unused_size)}
                    </span>
                {/if}
            {/if}
        </div>
        <div
            class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 overflow-y-auto min-h-0"
        >
            {#each assets as asset (asset.name)}
                {@const kind = asset_kind(asset.name)}
                <div
                    class="group relative flex flex-col gap-1 p-1 rounded-box bg-base-200 {picking
                        ? 'hover:ring-2 hover:ring-info'
                        : ''}"
                >
                    {#if picking}
                        <button
                            class="absolute inset-0 z-10 cursor-pointer rounded-box"
                            aria-label="{asset_title(asset.name)} auswählen"
                            onclick={() => choose(asset.name)}
                        ></button>
                    {/if}
                    <div
                        class="aspect-video w-full rounded-field overflow-hidden bg-base-300 flex items-center justify-center"
                    >
                        {#if kind === "image" || kind === "video"}
                            <Display
                                asset={asset.name}
                                alt={asset_title(asset.name)}
                                class="w-full h-full object-cover pointer-events-none"
                            />
                        {:else}
                            <i
                                class="fa-solid {kind === 'audio'
                                    ? 'fa-music'
                                    : 'fa-file'} text-3xl opacity-50"
                            ></i>
                        {/if}
                    </div>
                    <span
                        class="badge badge-xs badge-neutral absolute top-2 left-2 gap-1 pointer-events-none"
                    >
                        <i
                            class="fa-solid {kind === 'image'
                                ? 'fa-image'
                                : kind === 'video'
                                  ? 'fa-film'
                                  : kind === 'audio'
                                    ? 'fa-music'
                                    : 'fa-file'}"
                        ></i>
                    </span>
                    <span class="text-xs truncate" title={asset.name}
                        >{asset_title(asset.name)}</span
                    >
                    <span
                        class="text-xs text-base-content/50 flex flex-row items-center gap-1"
                    >
                        {megabytes(asset.size)}
                        {#if !asset.used}
                            <span class="badge badge-xs badge-warning badge-soft"
                                >unbenutzt</span
                            >
                        {/if}
                    </span>
                    {#if !picking && !asset.used}
                        <button
                            class="btn btn-xs absolute top-2 right-2 {confirm_delete ===
                            asset.name
                                ? 'btn-error'
                                : 'btn-square opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
                            aria-label="Datei löschen"
                            title="Löschen"
                            onclick={(event) => {
                                event.stopPropagation();
                                request_delete(asset.name);
                            }}
                        >
                            {#if confirm_delete === asset.name}
                                Löschen?
                            {:else}
                                <i class="fa-solid fa-trash"></i>
                            {/if}
                        </button>
                    {/if}
                </div>
            {:else}
                <p class="col-span-full text-center text-base-content/60 py-6">
                    Keine Dateien gefunden
                </p>
            {/each}
        </div>
        {#if !picking}
            <p class="text-xs text-base-content/50">
                Nur Dateien, die keine Szene und kein Marker mehr nutzt, lassen
                sich löschen.
            </p>
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0">close</button>
    </form>
</dialog>
