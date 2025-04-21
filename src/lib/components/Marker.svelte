<script lang="ts">
    import { fade } from "svelte/transition";
    import { appState, gameState, Tools } from "../../routes/state.svelte";
    import { draggable } from "@neodrag/svelte";
    // @ts-ignore
    import MultiSelect from 'svelte-multiselect';
    // @ts-ignore
    import throttle from 'just-throttle';
    import { PutScene } from "$lib/types/messaging/client_messages";

    let {marker, dragOptions, columnCount, mapUse=true} = $props();
    let markerElement: HTMLDivElement | null = $state(null);
    let scene_marker = $derived(gameState.scene?.state.markers.find((new_marker) => new_marker.name === marker.name) || {name: "", size: 1, status_effects: []})
    let scene_marker_index = $derived(gameState.scene?.state.markers.findIndex((new_marker) => new_marker.name === marker.name));

    $effect(() => {
        if (!markerElement) return;
        markerElement.style.pointerEvents = (appState.selected_tool === Tools.Pointer || appState.selected_tool === Tools.None) ? "auto": "none";
        markerElement.style.setProperty('anchor-name', `--${marker.name.replaceAll(" ", "-")}`);
        markerElement.style.setProperty('--y-translate', `${0.8 - 0.8 / appState.zoom}rem`);
    });

    function getAssetUrl(asset: string) {
        return `${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets/${asset}?key=${encodeURIComponent(appState.token || "")}`;
    }

    let throttled_save = throttle(() => {
        if(!gameState.scene) return;
        appState.ws?.send(PutScene.update(gameState.scene));
    }, 200, {leading: false, trailing: true});

    const effect_style_mapping = {
        "knocked": ["background: #8e3a38", "filter: grayscale(0.8)"],
        "petrified": ["background: gray", "filter: grayscale(1)"],
        "poisoned": ["background: #36d903", "filter: blur(0.5px);"],
        "burning": ["background: #ff4300", "filter: brightness(1.5) sepia(1) hue-rotate(333deg) saturate(3)"],
        "invisible": ["background: #cccccc44", "filter: opacity(0.5)"]
    }
</script>

<style lang="css">
    .tooltip::after {
        translate: 0 var(--y-translate);
    }
</style>

<div 
    bind:this={markerElement}
    use:draggable={dragOptions}
    id={marker.name}
    class="{!gameState.dm && mapUse ? 'tooltip' : ''} {mapUse ? '!absolute top-0 left-0' : 'relative'}"
>
    {#if !gameState.dm}
    <span class="tooltip-content flex justify-center items-center" style="height: {2 / appState.zoom}rem; translate: 0 var(--y-translate)">
        <span style="font-size: {1 / (appState.zoom)}rem">{marker.name}</span>
    </span>
    {/if}
    <button class={(gameState.dm && mapUse ? "dropdown dropdown-hover dropdown-right dropdown-center" : "") + " avatar"} popovertarget={marker.name.replaceAll(" ", "-")}>
        {#if gameState.locked_markers[marker.name]}
            <span class="absolute top-0 right-1/2 translate-x-1/2 badge badge-neutral z-10 badge-xs" transition:fade={{duration: 100}}>
                <i class="fa-solid fa-up-down-left-right"></i>
                {gameState.locked_markers[marker.name]}
            </span>
        {/if}
        <div class="relative mask mask-hexagon !flex justify-center items-center pointer-events-none bg-neutral" style="width: {typeof columnCount === "string" ? columnCount : `${marker.size / columnCount * 100}vw`}; {marker.status_effects && marker.status_effects[0] ? effect_style_mapping[marker.status_effects[0]][0] : ''}">
            <img
                alt="Marker"
                src={getAssetUrl(marker.file)}
                class="mask mask-hexagon !w-7/8 !h-7/8"
                style={marker.status_effects && marker.status_effects[0] ? effect_style_mapping[marker.status_effects[0]][1] : ''}
            />
        </div>
        {#if gameState.dm && mapUse}
            <ul class="dropdown-content menu bg-base-100 rounded-box z-1 min-w-52 p-2 shadow-sm !transition-none" style="transform: scale({Math.min(1 / appState.zoom, 1)})">
                <li>
                    <legend class="fieldset-legend pointer-events-none">Name</legend>
                    <input type="text" class="input" placeholder="Grom" bind:value={scene_marker.name} onchange={throttled_save} />
                    <legend class="fieldset-legend pointer-events-none">Größe</legend>
                    <input type="number" class="input" placeholder="1" min="1" max={gameState.scene?.columns || Infinity} bind:value={scene_marker.size} onchange={throttled_save} />
                    <legend class="fieldset-legend pointer-events-none">Statuseffekte</legend>
                    <MultiSelect on:change={throttled_save} options={Object.keys(effect_style_mapping)} bind:selected={scene_marker.status_effects} --sms-options-bg="black" --sms-max-width="13rem" --sms-min-height="2.5rem"></MultiSelect>
                </li>
                <li class="mt-2">
                    <!-- svelte-ignore node_invalid_placement_ssr -->
                    <button class="btn btn-soft btn-error" onclick={() => {
                        if (!gameState.scene) return;
                        gameState.scene.state.markers.splice(typeof scene_marker_index !== "number" ? Infinity : scene_marker_index, 1);
                        throttled_save();
                    }}>Entfernen</button>
                </li>
            </ul>
        {/if}
    </button>
</div>