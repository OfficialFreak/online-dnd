<script lang="ts">
    import { dragState } from "$lib/drag.svelte";
    import { appState, gameState } from "$lib/state.svelte";
    import Display from "./Display.svelte";

    let inner_width = $state(0);

    // Over the map the marker is shown at the size it will have once placed
    let marker_size = $derived(
        dragState.payload?.kind === "marker" &&
            dragState.over === "map" &&
            gameState.scene
            ? (dragState.payload.marker.size / gameState.scene.columns) *
                  inner_width *
                  appState.zoom
            : 64,
    );
</script>

<svelte:window bind:innerWidth={inner_width} />

{#if dragState.payload}
    <div
        class="fixed z-[10000] pointer-events-none -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
        style="left: {dragState.x}px; top: {dragState.y}px;"
    >
        {#if dragState.payload.kind === "marker"}
            <div
                class="mask mask-hexagon aspect-square bg-neutral p-[3%] opacity-80"
                style="width: {marker_size}px"
            >
                <Display
                    asset={dragState.payload.marker.file}
                    alt={dragState.payload.marker.name}
                    class="w-full aspect-square mask mask-hexagon object-cover object-top"
                />
            </div>
        {:else}
            <div
                class="frosted rounded-box px-3 py-2 flex flex-row items-center gap-2 font-bold shadow-lg"
            >
                <i class="fa-solid fa-map"></i>
                {dragState.payload.scene.name}
            </div>
        {/if}
        {#if dragState.over === "map"}
            <span class="badge badge-info badge-sm whitespace-nowrap">
                {dragState.payload.kind === "marker"
                    ? "Loslassen zum Platzieren"
                    : "Loslassen zum Aktivieren"}
            </span>
        {/if}
    </div>
{/if}
