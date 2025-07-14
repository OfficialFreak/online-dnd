<script lang="ts">
    import { appState } from "$lib/state.svelte";

    let {
        asset,
        hoverVideoOnly = false,
        thumbnail = true,
        ...props
    } = $props();

    let hovering = $state(false);
    let asset_name = $derived(
        thumbnail || (hoverVideoOnly && !hovering)
            ? asset + "_thumbnail.webp"
            : asset,
    );
    let video = $derived(asset_name.endsWith(".mp4"));

    let url = $derived(
        appState.token
            ? `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets/${asset_name}?key=${encodeURIComponent(appState.token)}`
            : "",
    );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="contents"
    onmouseenter={() => {
        hovering = true;
        console.log("Hovering");
    }}
    onmouseleave={() => {
        hovering = false;
        console.log("Hovering ended");
    }}
>
    {#if url}
        {#if video}
            <video autoplay loop src={url} {...props}></video>
        {:else}
            <img src={url} {...props} />
        {/if}
    {:else}
        <div {...props}></div>
    {/if}
</div>
