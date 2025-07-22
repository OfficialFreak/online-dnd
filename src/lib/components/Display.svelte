<script lang="ts">
    import { appState } from "$lib/state.svelte";

    let {
        asset,
        hoverVideoOnly = false,
        thumbnail = true,
        ...props
    } = $props();

    let hovering = $state(true);
    let thumbnail_asset_name = $derived(asset + "_thumbnail.webp");
    let video = $derived(asset.endsWith(".mp4"));
    let still = $derived(video ? asset + "_still.webp" : asset);

    function toUrl(asset_name: string) {
        return appState.token
            ? `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets/${asset_name}?key=${encodeURIComponent(appState.token)}`
            : "";
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="contents">
    {#if thumbnail}
        {#if toUrl(thumbnail_asset_name)}
            <img src={toUrl(thumbnail_asset_name)} {...props} />
        {:else}
            <div {...props}></div>
        {/if}
    {:else if toUrl(asset)}
        {#if video}
            {#if !hoverVideoOnly || hovering}
                <video
                    autoplay
                    loop
                    src={toUrl(asset)}
                    poster={toUrl(still)}
                    {...props}
                ></video>
            {:else}
                <img src={toUrl(still)} {...props} />
            {/if}
        {:else}
            <img src={toUrl(asset)} {...props} />
        {/if}
    {:else}
        <div {...props}></div>
    {/if}
</div>
