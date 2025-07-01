<script lang="ts">
    import { fade } from "svelte/transition";
    import { appState, gameState, Tools } from "../state.svelte";
    import { draggable } from "@neodrag/svelte";
    // @ts-ignore
    import MultiSelect from "svelte-multiselect";
    // @ts-ignore
    import throttle from "just-throttle";
    import { PutScene } from "$lib/types/messaging/client_messages";

    let {
        marker,
        dragOptions,
        columnCount,
        mapUse = true,
        banner = false,
    } = $props();
    let markerElement: HTMLDivElement | null = $state(null);
    let scene_marker = $derived(
        gameState.scene?.state.markers.find(
            (new_marker) => new_marker.name === marker.name,
        ) || { name: "", size: 1, status_effects: [] },
    );
    let scene_marker_index = $derived(
        gameState.scene?.state.markers.findIndex(
            (new_marker) => new_marker.name === marker.name,
        ),
    );

    $effect(() => {
        if (!markerElement) return;
        markerElement.style.pointerEvents =
            (appState.selectedTool === Tools.Ruler ||
                appState.selectedTool === Tools.Pointer ||
                appState.selectedTool === Tools.None) &&
            !banner
                ? "auto"
                : "none";
        markerElement.style.setProperty(
            "anchor-name",
            `--${marker.name?.replaceAll(" ", "-") || ""}`,
        );
        markerElement.style.setProperty(
            "--y-translate",
            `${0.8 - 0.8 / appState.zoom}rem`,
        );
    });

    function getAssetUrl(asset: string) {
        return appState.token
            ? `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets/${asset}?key=${encodeURIComponent(appState.token)}`
            : "";
    }

    let throttled_save = throttle(
        () => {
            if (!gameState.scene) return;
            appState.ws?.send(PutScene.update(gameState.scene));
        },
        200,
        { leading: false, trailing: true },
    );

    // svelte-ignore state_referenced_locally
    let old_name = scene_marker.name;

    const effect_style_mapping = {
        knocked: ["background: #8e3a38", "filter: grayscale(0.8)"],
        petrified: ["background: gray", "filter: grayscale(1)"],
        poisoned: ["background: #36d903", "filter: blur(0.5px);"],
        burning: [
            "background: #ff4300",
            "filter: brightness(1.5) sepia(1) hue-rotate(333deg) saturate(3)",
        ],
        invisible: ["background: #cccccc44", "filter: opacity(0.5)"],
    };
</script>

<div
    bind:this={markerElement}
    use:draggable={dragOptions}
    id={marker.name}
    class="{!gameState.dm && mapUse ? 'tooltip tooltip-right' : ''} {mapUse
        ? '!absolute top-0 left-0'
        : 'relative'} {!gameState.dm &&
        banner &&
        '!pointer-events-none'} hover:isolate hover:z-[9999]"
>
    {#if !gameState.dm}
        <span
            class="tooltip-content justify-center items-center flex !absolute"
            style="border-radius: {1 / appState.zoom}rem; padding: 0 {1 /
                appState.zoom}rem; transform: translate({20 /
                appState.zoom}px, -50%) !important; inset: unset !important; top: 50% !important; left: 100% !important;"
        >
            <span
                style="font-size: {16 / appState.zoom}px; height: {40 /
                    appState.zoom}px; line-height: {40 / appState.zoom}px;"
                class="flex justify-center items-center">{marker.name}</span
            >
        </span>
    {/if}
    <button
        class={(gameState.dm && mapUse
            ? "dropdown dropdown-hover dropdown-right dropdown-center"
            : "") +
            " avatar flex " +
            (banner ? " aspect-[2/3] " : "") +
            (!gameState.dm && banner && " pointer-events-none ")}
        popovertarget={marker.name?.replaceAll(" ", "-") || ""}
    >
        {#if gameState.lockedMarkers[marker.name]}
            <span
                class="absolute top-0 right-1/2 translate-x-1/2 badge badge-neutral z-10 badge-xs"
                transition:fade={{ duration: 100 }}
            >
                <i class="fa-solid fa-up-down-left-right"></i>
                {gameState.lockedMarkers[marker.name]}
            </span>
        {/if}
        <div
            class={"relative mask pointer-events-none bg-neutral !flex justify-center items-center aspect-square " +
                (banner ? "mask-banner" : "mask-hexagon")}
            style="padding: calc(3% + 0.03vw); width: {typeof columnCount ===
            'string'
                ? columnCount
                : `${(marker.size / columnCount) * 100}vw`}; {marker.status_effects &&
            marker.status_effects[0]
                ? effect_style_mapping[marker.status_effects[0]][0]
                : ''} {banner && 'transition: width 0.05s ease-out;'}"
        >
            <img
                alt="Marker"
                class={"w-full aspect-square mask " +
                    (banner ? "mask-banner" : "mask-hexagon")}
                src={getAssetUrl(marker.file)}
                style={marker.status_effects && marker.status_effects[0]
                    ? effect_style_mapping[marker.status_effects[0]][1]
                    : ""}
            />
        </div>
        {#if gameState.dm && mapUse}
            <ul
                class="dropdown-content menu bg-base-100 rounded-box z-1 min-w-52 p-2 shadow-sm !transition-none"
                style="transform: scale({Math.min(1 / appState.zoom, 1)})"
            >
                <li>
                    <legend class="fieldset-legend pointer-events-none"
                        >Name</legend
                    >
                    <input
                        type="text"
                        class="input"
                        placeholder="Grom"
                        bind:value={scene_marker.name}
                        oninput={() => {
                            if (gameState.scene?.state.turn === old_name) {
                                gameState.scene.state.turn = scene_marker.name;
                            }

                            let initiative =
                                gameState.scene?.state.initiative.find(
                                    (initiative) => initiative[1] === old_name,
                                );
                            if (initiative) {
                                initiative[1] = scene_marker.name;
                            }

                            old_name = scene_marker.name;
                        }}
                        onchange={throttled_save}
                    />
                    <legend class="fieldset-legend pointer-events-none"
                        >Größe</legend
                    >
                    <input
                        type="number"
                        class="input"
                        placeholder="1"
                        min="1"
                        max={gameState.scene?.columns || Infinity}
                        bind:value={scene_marker.size}
                        onchange={throttled_save}
                    />
                    <legend class="fieldset-legend pointer-events-none"
                        >Statuseffekte</legend
                    >
                    <MultiSelect
                        on:change={throttled_save}
                        options={Object.keys(effect_style_mapping)}
                        bind:selected={scene_marker.status_effects}
                        --sms-options-bg="black"
                        --sms-max-width="13rem"
                        --sms-min-height="2.5rem"
                    ></MultiSelect>
                </li>
                <li class="mt-2">
                    <!-- svelte-ignore node_invalid_placement_ssr -->
                    <button
                        class="btn btn-soft btn-error"
                        onclick={() => {
                            if (!gameState.scene) return;
                            // Remove from initiative
                            gameState.scene.state.initiative.splice(
                                gameState.scene.state.initiative.findIndex(
                                    (initiative) =>
                                        initiative[1] === scene_marker.name,
                                ),
                                1,
                            );

                            if (
                                gameState.scene.state.turn === scene_marker.name
                            ) {
                                gameState.scene.state.turn = null;
                            }

                            gameState.scene.state.markers.splice(
                                typeof scene_marker_index !== "number"
                                    ? Infinity
                                    : scene_marker_index,
                                1,
                            );
                            throttled_save();
                        }}>Entfernen</button
                    >
                </li>
            </ul>
        {/if}
    </button>
</div>

<style lang="css">
    .tooltip::after {
        content: unset !important;
    }

    .mask-banner {
        clip-path: polygon(
            0% 0%,
            100% 0%,
            100% 70%,
            65% 85%,
            50% 100%,
            35% 85%,
            0% 70%
        );
    }
</style>
