<script lang="ts">
    import { appState } from "$lib/state.svelte";

    let { asset, thumbnail = true, ...props } = $props();

    let asset_name = $derived(thumbnail ? asset + "_thumbnail.webp" : asset);

    let video = $derived(asset_name.endsWith(".mp4"));

    let url = $derived(
        appState.token
            ? `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets/${asset_name}?key=${encodeURIComponent(appState.token)}`
            : "",
    );
</script>

{#if url}
    {#if video}
        <video autoplay loop src={url} {...props}></video>
    {:else}
        <img src={url} {...props} />
    {/if}
{:else}
    <div {...props}></div>
{/if}
