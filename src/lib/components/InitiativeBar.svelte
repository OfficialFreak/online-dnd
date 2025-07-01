<script lang="ts">
    import { fade } from "svelte/transition";
    import Marker from "./Marker.svelte";
    import { gameState } from "$lib/state.svelte";

    let columnCount =
        (gameState.scene?.state.initiative.length || 0) > 17 ? 30 : 20;
    let sorted_initiative = $derived(
        gameState.scene?.state.initiative.toSorted((a, b) => b[0] - a[0]),
    );

    let sorted_markers = $derived(
        sorted_initiative?.map((initiative) =>
            gameState.scene?.state.markers.find(
                (marker) => marker.name === initiative[1],
            ),
        ) || [],
    );
</script>

<div
    transition:fade|global={{ duration: 100 }}
    class="flex flex-row gap-1 w-min {!gameState.dm
        ? 'pointer-events-none'
        : 'pointer-events-auto'}"
>
    {#each sorted_markers as marker}
        <Marker
            marker={{ ...marker, size: 1 }}
            mapUse={false}
            columnCount={columnCount -
                (gameState.scene?.state.turn === marker?.name ? 4 : 0)}
            dragOptions={{
                disabled: true,
            }}
            banner={true}
        />
    {:else}
        <span class="min-w-max mt-2 p-1 frosted rounded-md text-xl font-bold">
            Keine Marker in der Initiative
        </span>
    {/each}
</div>
