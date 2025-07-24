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

    let video_element: HTMLVideoElement | null = $state(null);
    let video_timeout = $state(-1);

    // Timing out video because sometimes the mouseleave event doesn't fire (Doesn't time out when cursor stays on - for some reason lmao)
    function setVideoTimeout() {
        if (video_timeout != -1) {
            clearTimeout(video_timeout);
        }
        if (hovering && video_element) {
            video_timeout = setTimeout(() => {
                hovering = false;
            }, video_element.duration * 1000);
        }
    }

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
                <!-- onloadeddata doesn't fire on mobile with data-saver enabled (code is removed on mobile) -->
                <video
                    onloadeddata={setVideoTimeout}
                    bind:this={video_element}
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
