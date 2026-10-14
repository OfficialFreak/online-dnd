<script lang="ts">
    import { dragSource } from "$lib/drag.svelte";
    import {
        delete_marker_template,
        dialogs,
        gameState,
    } from "$lib/state.svelte";
    import Display from "./Display.svelte";

    let search = $state("");
    let confirm_delete: string | null = $state(null);
    let confirm_timeout: ReturnType<typeof setTimeout> | undefined;

    let markers = $derived(
        gameState.markerLib
            .filter((marker) =>
                marker.name.toLowerCase().includes(search.trim().toLowerCase()),
            )
            .toSorted((a, b) => a.name.localeCompare(b.name)),
    );

    function request_delete(name: string) {
        if (confirm_delete === name) {
            confirm_delete = null;
            delete_marker_template(name);
            return;
        }
        confirm_delete = name;
        // An older timer would end this confirmation early
        clearTimeout(confirm_timeout);
        confirm_timeout = setTimeout(() => {
            if (confirm_delete === name) confirm_delete = null;
        }, 3000);
    }
</script>

<div class="p-2 px-4 flex flex-col gap-2 min-h-full">
    <h1 class="text-3xl font-bold">Marker</h1>
    <label class="input input-sm w-full">
        <i class="fa-solid fa-magnifying-glass opacity-50"></i>
        <input type="search" placeholder="Suchen" bind:value={search} />
    </label>
    <div class="grid grid-cols-3 gap-1">
        {#each markers as marker (marker.name)}
            <div
                class="group relative flex flex-col items-center gap-1 p-2 rounded-box hover:bg-base-content/10 cursor-grab active:cursor-grabbing select-none touch-pan-y"
                use:dragSource={{ kind: "marker", marker }}
            >
                <div
                    class="mask mask-hexagon aspect-square w-full bg-neutral p-[6%] pointer-events-none overflow-hidden"
                >
                    <Display
                        asset={marker.file}
                        alt={marker.name}
                        class="w-full aspect-square mask mask-hexagon object-cover object-top drag-none"
                    />
                </div>
                <span
                    class="text-xs text-center line-clamp-2 break-words w-full"
                    >{marker.name}</span
                >
                <span
                    class="badge badge-xs absolute top-1 left-1 pointer-events-none"
                    title="Größe"
                >
                    <i class="fa-solid fa-up-right-and-down-left-from-center"
                    ></i>
                    {marker.size}
                </span>
                <div class="absolute top-1 right-1 flex flex-row gap-0.5">
                    {#if confirm_delete !== marker.name}
                        <button
                            class="btn btn-xs btn-square shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label="Marker bearbeiten"
                            title="Bearbeiten"
                            onclick={() => dialogs.marker?.edit(marker)}
                        >
                            <i class="fa-solid fa-pen"></i>
                        </button>
                    {/if}
                    <button
                        class="btn btn-xs {confirm_delete === marker.name
                            ? 'btn-error'
                            : 'btn-square shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
                        aria-label="Marker löschen"
                        title="Löschen"
                        onclick={() => request_delete(marker.name)}
                    >
                        {#if confirm_delete === marker.name}
                            Löschen?
                        {:else}
                            <i class="fa-solid fa-trash"></i>
                        {/if}
                    </button>
                </div>
            </div>
        {:else}
            <p class="col-span-3 text-center text-base-content/60 py-4">
                {search ? "Kein Marker gefunden" : "Noch keine Marker"}
            </p>
        {/each}
    </div>
    <div class="flex flex-row gap-1">
        <button
            class="btn flex-1"
            onclick={() => {
                dialogs.marker?.open();
            }}>Marker erstellen</button
        >
        <button
            class="btn flex-1"
            title="Monster mit ihren Werten aus Open5e als Marker anlegen"
            onclick={() => dialogs.monster?.open()}
        >
            <i class="fa-solid fa-dragon"></i>
            Monster suchen
        </button>
    </div>
</div>
