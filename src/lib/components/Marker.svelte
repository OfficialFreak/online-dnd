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
    import throttle from "just-throttle";
    import { Blood, PutScene } from "$lib/types/messaging/client_messages";
    import CharacterPreview from "./CharacterPreview.svelte";
    import { spill_blood } from "$lib/effects";
    import {
        CONDITION_KEYS,
        CONDITIONS,
        normalize_condition,
    } from "$lib/conditions";
    import Display from "./Display.svelte";
    import ConditionEffects from "./ConditionEffects.svelte";

    let {
        marker,
        dragOptions,
        columnCount,
        mapUse = true,
        banner = false,
        interactive = true,
    } = $props();
    let markerElement: HTMLDivElement | null = $state(null);
    let scene_marker = $derived(
        gameState.scene?.state.markers.find(
            (new_marker) => new_marker.name === marker.name,
        ) || {
            name: "",
            size: 1,
            status_effects: [],
            hidden: false,
            hp: null,
            max_hp: null,
        },
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
            interactive &&
            (appState.selectedTool === Tools.Ruler ||
                appState.selectedTool === Tools.Pointer ||
                appState.selectedTool === Tools.None)
                ? "auto"
                : "none";
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

    // The name before the rename input changed it. Components get reused for other
    // markers when the list changes, so this follows the shown marker.
    let old_name = "";
    $effect.pre(() => {
        old_name = scene_marker.name;
    });

    let connected_character = $derived(getCharacter(marker.name));

    /** The marker's conditions, and those of its character from D&D Beyond */
    let effects: string[] = $derived(
        [
            ...new Set([
                ...(marker.status_effects ?? []).map(normalize_condition),
                ...(connected_character?.activeStatusEffects ?? []),
            ]),
        ].filter((effect) => CONDITIONS[effect]),
    );
    let conditions = $derived(effects.map((effect) => CONDITIONS[effect]));
    // Animations only play on the map, not in the initiative bar or previews
    let animated = $derived(mapUse && !banner);
    let image_filter = $derived(
        conditions
            .map((condition) => condition.filter)
            .filter(Boolean)
            .join(" "),
    );
    let animation = $derived(
        animated
            ? conditions
                  .map((condition) => condition.animation)
                  .filter(Boolean)
                  .join(", ")
            : "",
    );
    let prone = $derived(
        animated && conditions.some((condition) => condition.prone),
    );

    /** A ring of hit points: a character's from D&D Beyond for everyone, other creatures' only for DMs */
    let health = $derived(
        connected_character
            ? {
                  current: connected_character.currentHealth,
                  max: connected_character.maxHealth,
              }
            : gameState.dm && marker.max_hp
              ? { current: marker.hp ?? marker.max_hp, max: marker.max_hp }
              : null,
    );
    let health_degrees = $derived(
        health ? Math.max(0, Math.min(1, health.current / health.max)) * 360 : 360,
    );

    let hp_change: number | null = $state(null);

    /** Damage is negative. At 0 hit points the creature falls unconscious. */
    function change_hp(delta: number) {
        if (!delta) return;
        const before = scene_marker.hp ?? scene_marker.max_hp ?? 0;
        const after = Math.max(
            0,
            Math.min(scene_marker.max_hp ?? Infinity, before + delta),
        );
        scene_marker.hp = after;
        const current = (scene_marker.status_effects ?? []).map(
            normalize_condition,
        );
        if (after === 0 && !current.includes("unconscious")) {
            scene_marker.status_effects = [...current, "unconscious"];
        } else if (after > 0 && before === 0) {
            scene_marker.status_effects = current.filter(
                (effect) => effect !== "unconscious",
            );
        }
        hp_change = null;
        throttled_save();
    }

    function toggle_condition(effect: string) {
        const current = (scene_marker.status_effects ?? []).map(
            normalize_condition,
        );
        scene_marker.status_effects = current.includes(effect)
            ? current.filter((active) => active !== effect)
            : [...current, effect];
        throttled_save();
    }
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
    class="{banner ? 'group' : ''} {!gameState.dm &&
    mapUse &&
    !getCharacter(marker.name)
        ? 'tooltip tooltip-right'
        : ''} {mapUse ? '!absolute top-0 left-0' : 'relative'} {!gameState.dm &&
    banner
        ? '!pointer-events-none'
        : ''} {mapUse ? 'hover:isolate hover:z-[9999]' : ''}"
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
            (!gameState.dm && banner ? " pointer-events-none " : " ") +
            (marker.hidden && mapUse ? " opacity-50 " : "")}
    >
        {#if banner && !getCharacter(marker.name)}
            <span
                class="absolute bottom-0 right-1/2 translate-x-1/2 badge badge-neutral z-10 badge-xs h-fit w-full transition-opacity opacity-0 group-hover:opacity-100"
            >
                {marker.name}
            </span>
        {/if}
        {#if marker.hidden && mapUse}
            <span
                class="absolute top-0 left-0 badge badge-warning z-10 badge-xs"
                title="Versteckt, nur DMs sehen diesen Marker"
            >
                <i class="fa-solid fa-eye-slash"></i>
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
            class={"condition-animated relative mask pointer-events-none !flex justify-center items-center aspect-square " +
                (banner ? "mask-banner" : "mask-hexagon")}
            style="padding: calc(3% + 0.03vw); --background: {conditions[0]
                ?.color ?? 'var(--color-neutral)'}; width: {typeof columnCount ===
            'string'
                ? columnCount
                : `${(marker.size / columnCount) * 100}vw`}; {banner
                ? 'transition: width 0.05s ease-out'
                : 'transition: transform 0.4s ease-out'}; transform: {prone
                ? 'rotate(90deg)'
                : 'none'}; animation: {animation || 'none'}; {health
                ? `background: conic-gradient(var(--background) ${health_degrees}deg, #ff002b73 ${health_degrees}deg) !important;`
                : 'background: var(--background)'}"
        >
            <Display
                alt={marker.name}
                class={"w-full aspect-square mask object-cover object-top pointer-events-auto drag-none " +
                    (banner ? "mask-banner" : "mask-hexagon")}
                hoverVideoOnly={true}
                thumbnail={!(mapUse || banner)}
                asset={marker.file}
                style={image_filter ? `filter: ${image_filter};` : ""}
            />
            {#each conditions as condition}
                {#if condition.overlay}
                    <img
                        alt="Effect Overlay"
                        class={"absolute w-full aspect-square mask " +
                            (banner ? "mask-banner" : "mask-hexagon")}
                        src={condition.overlay}
                    />
                {/if}
            {/each}
        </div>
        {#if animated && interactive && effects.length > 0}
            <ConditionEffects {effects} />
        {/if}
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
                        onchange={() => {
                            if (!(Number(scene_marker.size) > 0)) {
                                scene_marker.size = 1;
                            }
                            throttled_save();
                        }}
                    />
                    {#if !connected_character}
                        <legend class="fieldset-legend pointer-events-none"
                            >Trefferpunkte</legend
                        >
                        <!-- The menu lays out its direct children in a row -->
                        <div class="p-0 hover:bg-transparent">
                            <div class="flex flex-col gap-1">
                                <div class="flex flex-row items-center gap-1">
                                    <input
                                        type="number"
                                        class="input input-sm w-20"
                                        min="0"
                                        placeholder="–"
                                        aria-label="Aktuelle Trefferpunkte"
                                        bind:value={scene_marker.hp}
                                        onchange={throttled_save}
                                    />
                                    <span>/</span>
                                    <input
                                        type="number"
                                        class="input input-sm w-20"
                                        min="1"
                                        placeholder="–"
                                        aria-label="Maximale Trefferpunkte"
                                        bind:value={scene_marker.max_hp}
                                        onchange={() => {
                                            scene_marker.hp ??=
                                                scene_marker.max_hp;
                                            throttled_save();
                                        }}
                                    />
                                </div>
                                <div class="join">
                                    <input
                                        type="number"
                                        min="0"
                                        class="input input-sm join-item w-20"
                                        placeholder="Wert"
                                        aria-label="Schaden oder Heilung"
                                        bind:value={hp_change}
                                        onkeydown={(event) => {
                                            if (event.key === "Enter") {
                                                change_hp(-(hp_change ?? 0));
                                            }
                                        }}
                                    />
                                    <!-- svelte-ignore node_invalid_placement_ssr -->
                                    <button
                                        class="btn btn-sm btn-soft btn-error join-item"
                                        title="Enter im Feld zieht auch ab"
                                        onclick={() =>
                                            change_hp(-(hp_change ?? 0))}
                                        >Schaden</button
                                    >
                                    <!-- svelte-ignore node_invalid_placement_ssr -->
                                    <button
                                        class="btn btn-sm btn-soft btn-success join-item"
                                        onclick={() => change_hp(hp_change ?? 0)}
                                        >Heilung</button
                                    >
                                </div>
                            </div>
                        </div>
                    {/if}
                    <legend class="fieldset-legend pointer-events-none"
                        >Zustände</legend
                    >
                    <!-- The menu lays out its direct children in a row, so the grid needs a wrapper -->
                    <div class="p-0 hover:bg-transparent">
                    <div class="grid grid-cols-3 gap-1 w-80">
                        {#each CONDITION_KEYS as effect (effect)}
                            {@const active = scene_marker.status_effects
                                ?.map(normalize_condition)
                                .includes(effect)}
                            <!-- svelte-ignore node_invalid_placement_ssr -->
                            <button
                                class="btn btn-xs gap-1 px-1.5 justify-start {active
                                    ? 'btn-neutral'
                                    : 'btn-ghost'}"
                                aria-pressed={active}
                                onclick={() => toggle_condition(effect)}
                            >
                                <span
                                    class="w-2 h-2 rounded-full"
                                    style="background: {CONDITIONS[effect]
                                        .color}"
                                ></span>
                                <span class="truncate"
                                    >{CONDITIONS[effect].label}</span
                                >
                            </button>
                        {/each}
                    </div>
                    </div>
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
                                if (!gameState.scene) return;
                                let idx =
                                    gameState.scene.state.initiative.findIndex(
                                        (initiative) =>
                                            initiative[1] === scene_marker.name,
                                    );
                                if (idx === -1) return;
                                gameState.scene.state.initiative.splice(idx, 1);
                                if (
                                    gameState.scene.state.turn ===
                                    scene_marker.name
                                ) {
                                    gameState.scene.state.turn = null;
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
                        class="btn btn-soft flex-1 {scene_marker.hidden
                            ? 'btn-warning'
                            : ''}"
                        title={scene_marker.hidden
                            ? "Spieler sehen den Marker wieder"
                            : "Nur DMs sehen den Marker"}
                        onclick={() => {
                            scene_marker.hidden = !scene_marker.hidden;
                            throttled_save();
                        }}
                    >
                        <i
                            class="fa-solid {scene_marker.hidden
                                ? 'fa-eye'
                                : 'fa-eye-slash'}"
                        ></i>
                        {scene_marker.hidden ? "Aufdecken" : "Verstecken"}
                    </button>
                    <!-- svelte-ignore node_invalid_placement_ssr -->
                    <button
                        class="btn btn-soft btn-error flex-1"
                        onclick={() => {
                            if (!gameState.scene) return;
                            // Remove from initiative
                            let idx =
                                gameState.scene.state.initiative.findIndex(
                                    (initiative) =>
                                        initiative[1] === scene_marker.name,
                                );
                            if (idx !== -1) {
                                gameState.scene.state.initiative.splice(idx, 1);
                            }

                            if (
                                gameState.scene.state.turn === scene_marker.name
                            ) {
                                gameState.scene.state.turn = null;
                            }

                            let marker_size =
                                typeof columnCount === "string"
                                    ? 0.01
                                    : marker.size / columnCount;

                            // Everyone sees the blood, not just the DM
                            spill_blood(marker.x.target, marker.y.target, marker_size);
                            appState.ws?.send(
                                Blood.create(
                                    marker.x.target,
                                    marker.y.target,
                                    marker_size,
                                ),
                            );

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
