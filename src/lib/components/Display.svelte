<script lang="ts">
    import { appState } from "$lib/state.svelte";
    import { debug } from "$lib/debug";

    let {
        asset,
        hoverVideoOnly = false,
        thumbnail = true,
        /**
         * A video map: laid out at its own pixels and scaled to its box. Laid out as large
         * as the zoomed map, Safari on an iPhone ran out of memory zooming it.
         */
        fit_video = false,
        /** Holds a video map still, e.g. during a zoom gesture */
        paused = false,
        ...props
    } = $props();

    /** The video's own size, once known */
    let native: [number, number] | null = $state(null);
    let box_width = $state(0);
    /** The video's box gets the class, the video the rest */
    let video_props = $derived.by(() => {
        const { class: _, ...rest } = props;
        return rest;
    });
    let video_size = $derived.by(() => {
        if (!native) return null;
        const ratio = window.devicePixelRatio || 1;
        const width = native[0] / ratio;
        return { width, height: native[1] / ratio, scale: box_width / width };
    });

    // While zooming the map stays on one frame: every frame of the video was drawn anew
    // into the moving map, in Safari into memory that ran out
    $effect(() => {
        if (!fit_video || !video_element) return;
        if (paused) video_element.pause();
        else video_element.play().catch(() => {});
    });

    let hovering = $state(false);
    let thumbnail_asset_name = $derived(asset + "_thumbnail.webp");
    let video = $derived(asset.toLowerCase().endsWith(".mp4"));
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
<div
    class="contents"
    onmouseenter={() => {
        hovering = true;
    }}
    onmouseleave={() => {
        hovering = false;
    }}
>
    {#if thumbnail}
        {#if toUrl(thumbnail_asset_name)}
            <img src={toUrl(thumbnail_asset_name)} {...props} />
        {:else}
            <div {...props}></div>
        {/if}
    {:else if toUrl(asset)}
        {#if video}
            {#if fit_video && !debug.has("still")}
                <div
                    class={props.class}
                    style="position: relative; aspect-ratio: {native
                        ? `${native[0]} / ${native[1]}`
                        : 'auto'}"
                    bind:clientWidth={box_width}
                >
                    <video
                        bind:this={video_element}
                        onloadedmetadata={(event) => {
                            const element = event.currentTarget;
                            native = [element.videoWidth, element.videoHeight];
                        }}
                        autoplay
                        loop
                        muted
                        playsinline
                        src={toUrl(asset)}
                        poster={toUrl(still)}
                        {...video_props}
                        style="position: absolute; left: 0; top: 0; max-width: none; transform-origin: 0 0; {video_size
                            ? `width: ${video_size.width}px; height: ${video_size.height}px; transform: scale(${video_size.scale});`
                            : 'width: 100%;'}"
                    ></video>
                </div>
            {:else if (!hoverVideoOnly || hovering) && !debug.has("still")}
                <!-- onloadeddata doesn't fire on mobile with data-saver enabled (code is removed on mobile) -->
                <!-- Inline and muted: without them an iPhone opens the video full screen
                     when a tap on a marker plays it, and plays nothing on its own -->
                <video
                    onloadeddata={setVideoTimeout}
                    bind:this={video_element}
                    autoplay
                    loop
                    muted
                    playsinline
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
