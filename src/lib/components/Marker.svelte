<script lang="ts">
    import { fade } from "svelte/transition";
    import { appState, gameState, Tools } from "../../routes/state.svelte";
    import { draggable } from "@neodrag/svelte";

    let {marker, dragOptions, columnCount, absolute=true} = $props();
    let markerElement: HTMLDivElement | null = $state(null);

    $effect(() => {
        if (!markerElement) return;
        markerElement.style.pointerEvents = (appState.selected_tool === Tools.Pointer || appState.selected_tool === Tools.None) ? "auto": "none";
    });

    function getAssetUrl(asset: string) {
        return `${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets/${asset}?key=${encodeURIComponent(appState.token || "")}`;
    }
</script>

<div 
    bind:this={markerElement}
    use:draggable={dragOptions}
    id={marker.name}
    class="avatar {absolute ? 'absolute top-0 left-0' : 'relative'}"
>
    {#if gameState.locked_markers[marker.name]}
        <span class="absolute top-0 right-1/2 translate-x-1/2 badge badge-neutral z-10 badge-xs" transition:fade={{duration: 100}}>
            <i class="fa-solid fa-up-down-left-right"></i>
            {gameState.locked_markers[marker.name]}
        </span>
    {/if}
    <div class="relative mask mask-hexagon !flex justify-center items-center pointer-events-none bg-neutral" style="width: {typeof columnCount === "string" ? columnCount : `${marker.size / columnCount * 100}vw`}">
        <img
            alt="Marker"
            src={getAssetUrl(marker.file)}
            class="mask mask-hexagon !w-7/8 !h-7/8"
        />
    </div>
</div>