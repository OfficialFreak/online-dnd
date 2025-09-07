<script lang="ts">
    import {
        appState,
        gameState,
        getCharacter,
        Tools,
        update_initiative,
    } from "../state.svelte";
    import { draggable } from "@neodrag/svelte";
    // @ts-ignore
    import MultiSelect from "svelte-multiselect";
    // @ts-ignore
    import throttle from "just-throttle";
    import { PutScene } from "$lib/types/messaging/client_messages";
    import CharacterPreview from "./CharacterPreview.svelte";
    import { onMount } from "svelte";
    // @ts-ignore
    import confetti from "canvas-confetti";
    import Display from "./Display.svelte";

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

    let position = $state({ x: 0, y: 0 });

    $effect(() => {
        if (!markerElement) return;
        markerElement.style.pointerEvents =
            appState.selectedTool === Tools.Ruler ||
            appState.selectedTool === Tools.Pointer ||
            appState.selectedTool === Tools.None
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
        knocked: ["--background: #8e3a38;", "filter: grayscale(0.8);", null],
        petrified: ["--background: gray;", "filter: grayscale(1);", null],
        poisoned: ["--background: #36d903;", "filter: blur(0.5px);", null],
        burning: [
            "--background: #ff4300;",
            "filter: brightness(1.5) sepia(1) hue-rotate(333deg) saturate(3);",
            "burning.gif",
        ],
        invisible: ["--background: #cccccc44;", "filter: opacity(0.5);", null],
    };

    let connected_character = $derived(getCharacter(marker.name));
    const blood = confetti.shapeFromText({
        text: "🔴",
    });
</script>

<div
    bind:this={markerElement}
    use:draggable={{
        ...dragOptions,
        position: banner ? position : dragOptions.position,
        onDrag: (evt) => {
            if (dragOptions.onDrag) {
                dragOptions.onDrag(evt);
            }
            if (banner) {
                position = { x: evt.offsetX, y: evt.offsetY };
            }
        },
        onDragEnd: (evt) => {
            if (dragOptions.onDragEnd) {
                dragOptions.onDragEnd(evt);
            }
            if (banner) {
                position.x = 0;
                position.y = 0;
                if (!markerElement) return;
                markerElement.style = "";
            }
        },
    }}
    id={(banner ? "banner-" : !mapUse ? "nomapuse-" : "") + marker.name}
    class="{!gameState.dm && mapUse && !getCharacter(marker.name)
        ? 'tooltip tooltip-right'
        : ''} {mapUse ? '!absolute top-0 left-0' : 'relative'} {!gameState.dm &&
        banner &&
        '!pointer-events-none'} {mapUse &&
        'hover:isolate hover:z-[9999]'} group"
>
    {#if !gameState.dm && !banner && !getCharacter(marker.name)}
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
        class={((gameState.dm && mapUse) ||
        (!gameState.dm && getCharacter(marker.name))
            ? "dropdown dropdown-hover dropdown-right dropdown-center"
            : "") +
            " avatar flex " +
            (banner ? " aspect-[2/3] " : "") +
            (!gameState.dm && banner && " pointer-events-none ")}
        popovertarget={marker.name?.replaceAll(" ", "-") || ""}
    >
        {#if banner && !getCharacter(marker.name)}
            <span
                class="absolute bottom-0 right-1/2 translate-x-1/2 badge badge-neutral z-10 badge-xs h-fit w-full transition-opacity opacity-0 group-hover:opacity-100"
            >
                {marker.name}
            </span>
        {/if}
        {#if gameState.lockedMarkers[marker.name]}
            <span
                class="absolute top-0 right-1/2 translate-x-1/2 badge badge-neutral z-10 badge-xs"
            >
                <i class="fa-solid fa-up-down-left-right"></i>
                {gameState.lockedMarkers[marker.name]}
            </span>
        {/if}
        <div
            class={"relative mask pointer-events-none !flex justify-center items-center aspect-square " +
                (banner ? "mask-banner" : "mask-hexagon")}
            style="padding: calc(3% + 0.03vw); --background: var(--color-neutral); width: {typeof columnCount ===
            'string'
                ? columnCount
                : `${(marker.size / columnCount) * 100}vw`}; {marker.status_effects &&
            marker.status_effects[0]
                ? effect_style_mapping[marker.status_effects[0]][0]
                : ''}; {banner &&
                'transition: width 0.05s ease-out'}; {connected_character
                ? `background: conic-gradient(var(--background) ${(connected_character.currentHealth / connected_character.maxHealth) * 360}deg, #ff002b73 ${(connected_character.currentHealth / connected_character.maxHealth) * 360}deg) !important;`
                : 'background: var(--background)'}"
        >
            <Display
                alt={marker.name}
                class={"w-full h-full mask object-cover object-top pointer-events-auto drag-none " +
                    (banner ? "mask-banner" : "mask-hexagon")}
                hoverVideoOnly={true}
                thumbnail={!(mapUse || banner)}
                asset={marker.file}
                style={marker.status_effects && marker.status_effects[0]
                    ? effect_style_mapping[marker.status_effects[0]][1]
                    : ""}
            />
            {#if marker.status_effects && marker.status_effects[0] && effect_style_mapping[marker.status_effects[0]][2] !== null}
                <img
                    alt="Effect Overlay"
                    class={"absolute w-full aspect-square mask " +
                        (banner ? "mask-banner" : "mask-hexagon")}
                    src={effect_style_mapping[marker.status_effects[0]][2]}
                />
            {/if}
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
                        --sms-options-bg="var(--color-base-100)"
                        --sms-max-width="13rem"
                        --sms-min-height="2.5rem"
                    ></MultiSelect>
                </li>
                <li class="mt-2 flex flex-row gap-1">
                    {#if !gameState.scene?.state.initiative.some((initiative) => initiative[1] === scene_marker.name)}
                        <!-- svelte-ignore node_invalid_placement_ssr -->
                        <button
                            class="btn btn-soft btn-info flex-1"
                            onclick={async () => {
                                gameState.scene?.state.initiative.push([
                                    0,
                                    scene_marker.name,
                                ]);

                                await update_initiative();
                            }}
                        >
                            <i class="fa-solid fa-plus"></i>
                            Initiative
                        </button>
                    {:else}
                        <!-- svelte-ignore node_invalid_placement_ssr -->
                        <button
                            class="btn btn-soft btn-warning flex-1"
                            onclick={async () => {
                                if (
                                    gameState.scene?.state.initiative.length ===
                                    1
                                ) {
                                    gameState.scene?.state.initiative.pop();
                                } else {
                                    console.log("Trying to find marker");
                                    if (!gameState.scene) return;
                                    console.log("Scene is available");
                                    let idx =
                                        gameState.scene.state.initiative.findIndex(
                                            (initiative) =>
                                                initiative[1] ===
                                                scene_marker.name,
                                        );

                                    if (idx === -1) return;
                                    gameState.scene?.state.initiative.splice(
                                        idx,
                                        1,
                                    );
                                }

                                await update_initiative();
                            }}
                        >
                            <i class="fa-solid fa-minus"></i>
                            Initiative
                        </button>
                    {/if}
                    <!-- svelte-ignore node_invalid_placement_ssr -->
                    <button
                        class="btn btn-soft btn-error flex-1"
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

                            let marker_size =
                                typeof columnCount === "string"
                                    ? 0.01
                                    : marker.size / columnCount;

                            console.log("Spawning Blood sized", marker_size);

                            gameState.map_confetti_function({
                                particleCount: 3,
                                angle: 90,
                                spread: 360,
                                scalar: 20 * marker_size,
                                startVelocity: 0,
                                ticks: 230,
                                origin: {
                                    x: marker.x.target + marker_size / 2,
                                    y: marker.y.target + marker_size / 2,
                                },
                                gravity: 0,
                                decay: 0.7,
                                flat: true,
                                shapes: [blood],
                            });
                            gameState.map_confetti_function({
                                particleCount: 100,
                                angle: 90,
                                spread: 360,
                                scalar: 10 * marker_size,
                                startVelocity: 50 * marker_size,
                                ticks: 200,
                                origin: {
                                    x: marker.x.target + marker_size / 2,
                                    y: marker.y.target + marker_size / 2,
                                },
                                gravity: 0,
                                decay: 0.7,
                                flat: true,
                                shapes: [blood],
                            });
                            gameState.map_confetti_function({
                                particleCount: 30,
                                angle: 90,
                                spread: 360,
                                scalar: 5 * marker_size,
                                startVelocity: 80 * marker_size,
                                ticks: 100,
                                origin: {
                                    x: marker.x.target + marker_size / 2,
                                    y: marker.y.target + marker_size / 2,
                                },
                                gravity: 0,
                                decay: 0.7,
                                flat: true,
                                shapes: [blood],
                            });

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
        {:else if getCharacter(marker.name) && !appState.dragging && mapUse}
            <ul
                class="dropdown-content menu z-1 p-0 shadow-sm w-80 flex flex-row justify-start items-start text-left !transition-none"
                style="transform: scale({Math.min(0.8 / appState.zoom, 1)})"
            >
                <CharacterPreview character={getCharacter(marker.name)} />
            </ul>
        {/if}
    </button>
</div>

<style lang="css">
    .tooltip::after {
        content: unset !important;
    }
</style>
