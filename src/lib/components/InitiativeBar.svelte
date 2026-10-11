<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import Marker from "./Marker.svelte";
    import {
        current_round,
        gameState,
        get_sorted_initiative,
        update_initiative,
    } from "$lib/state.svelte";
    import { flip } from "svelte/animate";

    let columnCount = $derived(
        (gameState.scene?.state.initiative.length || 0) > 17 ? 30 : 20,
    );

    let sorted_markers = $derived(
        (
            get_sorted_initiative()?.map((initiative) =>
                gameState.scene?.state.markers.find(
                    (marker) => marker.name === initiative[1],
                ),
            ) || []
        ).filter((elem) => elem !== undefined),
    );

    let dragging_marker: string | undefined = $state();
</script>

<div
    transition:fade|global={{ duration: 100 }}
    class="flex flex-row gap-1 w-min {!gameState.dm
        ? 'pointer-events-none'
        : 'pointer-events-auto'}"
>
    {#if sorted_markers.length > 0}
        <div
            class="self-start mt-2 mr-1 p-1 px-2 frosted rounded-box flex flex-col items-center leading-none"
            title="Kampfrunde"
        >
            <span class="text-[0.6rem] uppercase text-base-content/60"
                >Runde</span
            >
            {#key current_round()}
                <span class="text-2xl font-bold" in:fly={{ y: -10, duration: 300 }}
                    >{current_round()}</span
                >
            {/key}
        </div>
    {/if}
    {#each sorted_markers as marker (marker.name)}
        <div
            animate:flip={{
                duration: dragging_marker === marker.name ? 0 : 200,
            }}
        >
            <Marker
                marker={{ ...marker, size: 1 }}
                mapUse={false}
                columnCount={columnCount -
                    (gameState.scene?.state.turn === marker?.name ? 4 : 0)}
                dragOptions={{
                    disabled: !gameState.dm,
                    axis: "x",
                    onDragStart: () => {
                        dragging_marker = marker.name;
                    },
                    onDragEnd: async (evt: any) => {
                        // Otherwise this banner never animates again
                        dragging_marker = undefined;
                        if (sorted_markers.length === 0) return;
                        for (const [
                            index,
                            check_marker,
                        ] of sorted_markers.entries()) {
                            if (check_marker.name === marker.name) continue;
                            let marker_element = document.getElementById(
                                "banner-" + check_marker.name,
                            );
                            let element_x_coordinate =
                                (marker_element?.getBoundingClientRect().left ||
                                    0) +
                                (marker_element?.getBoundingClientRect()
                                    .width || 0) /
                                    2;
                            element_x_coordinate ??= -1;

                            if (evt.event.clientX >= element_x_coordinate)
                                continue;
                            // if this is the marker directly after, keep original initiative
                            if (
                                index - 1 >= 0 &&
                                sorted_markers[index - 1].name === marker.name
                            )
                                return;

                            // if Its the leftmost drop position, increment by one
                            if (index == 0) {
                                let first_initiative =
                                    gameState.scene?.state.initiative.find(
                                        (initiative) =>
                                            initiative[1] ===
                                            sorted_markers[0].name,
                                    );

                                if (!first_initiative) return;
                                let own_marker =
                                    gameState.scene?.state.initiative.find(
                                        (initiative) =>
                                            initiative[1] === marker.name,
                                    );
                                if (!own_marker) return;
                                own_marker[0] = first_initiative[0] + 1;
                                await update_initiative();
                                return;
                            }

                            // Set new initiative to be between this marker and the one before it
                            let prev_init =
                                gameState.scene?.state.initiative.find(
                                    (initiative) =>
                                        initiative[1] ===
                                        sorted_markers[index - 1].name,
                                );
                            let next_init =
                                gameState.scene?.state.initiative.find(
                                    (initiative) =>
                                        initiative[1] ===
                                        sorted_markers[index].name,
                                );
                            if (!prev_init || !next_init) return; // So typescript doesn't complain. It should never return here
                            let prev_initiative = prev_init[0];
                            let next_initiative = next_init[0];

                            if (prev_init[0] === next_init[0]) {
                                prev_init[0] += 0.001;
                                next_init[0] -= 0.001;
                            }

                            let new_initiative =
                                (prev_initiative + next_initiative) / 2;

                            let own_marker =
                                gameState.scene?.state.initiative.find(
                                    (initiative) =>
                                        initiative[1] === marker.name,
                                );
                            if (!own_marker) return;
                            own_marker[0] = new_initiative;
                            await update_initiative();
                            return;
                        }

                        let last_initiative =
                            gameState.scene?.state.initiative.find(
                                (initiative) =>
                                    initiative[1] ===
                                    sorted_markers[sorted_markers.length - 1]
                                        .name,
                            );

                        if (!last_initiative) return;
                        if (marker.name === last_initiative[1]) return;

                        let last_initiative_value = last_initiative[0];
                        // Set to the last position
                        let own_marker = gameState.scene?.state.initiative.find(
                            (initiative) => initiative[1] === marker.name,
                        );
                        if (!own_marker) return;
                        own_marker[0] = last_initiative_value - 1;
                        await update_initiative();
                    },
                }}
                banner={true}
            />
        </div>
    {:else}
        <span class="min-w-max mt-2 p-1 frosted rounded-box text-xl font-bold">
            Keine Marker in der Initiative
        </span>
    {/each}
</div>
