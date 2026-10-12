<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { appState, gameState } from "$lib/state.svelte";
    import { asset_url } from "$lib/assets";

    /**
     * The map's colours around it, like the ambient mode of YouTube: its edges stretched
     * outwards and blurred far, so every colour at its edge bleeds into the background.
     * Behind everything, also behind a background image where that leaves gaps. Follows
     * the map when it moves or zooms, the frames of a video map, and dims in dark scenes.
     */

    /** Width of the small copy of the map the light is made from */
    const SAMPLE = 48;
    /** How far the edges reach out, in sizes of the map */
    const MARGIN = 1.5;
    /**
     * How often a video map is looked at again, in milliseconds. Each look scales a frame
     * of up to 4K down on the graphics card, at 15 a second that kept it busy a quarter
     * of the time.
     */
    const VIDEO_EVERY = 500;

    /** Two take turns, so a new map's light fades in over the last one's */
    let canvases: HTMLCanvasElement[] = $state([]);
    let front = $state(0);

    const base = document.createElement("canvas");
    const extended = document.createElement("canvas");
    const glow = document.createElement("canvas");
    const average = document.createElement("canvas");
    average.width = average.height = 1;
    /** The glow fading with the distance from the map, and what fades it */
    const light = document.createElement("canvas");
    const falloff = document.createElement("canvas");

    let shown_file = "";
    let sampled = false;
    let last_look = "";
    let frame = 0;
    /** The map on the page, watched for moving */
    let watched: Element | null = null;

    /** Darker in a dark scene, a little darker always so the controls stay readable */
    let dimming = $derived.by(() => {
        const state = gameState.scene?.state;
        if (!state?.vision) return 0.85;
        return state.lighting === "dark" ? 0.45 : state.lighting === "dim" ? 0.65 : 0.85;
    });

    function size_of(media: HTMLImageElement | HTMLVideoElement) {
        return media instanceof HTMLVideoElement
            ? { width: media.videoWidth, height: media.videoHeight }
            : { width: media.naturalWidth, height: media.naturalHeight };
    }

    /** The map on the page, for its place on the screen and a video's frames */
    function map_media() {
        const media = document.querySelector('[data-map="main"]');
        return media instanceof HTMLImageElement || media instanceof HTMLVideoElement
            ? media
            : null;
    }

    /**
     * The light comes from the server's small picture of the map. Drawing the map itself,
     * up to 8192 pixels a side, decoded it whole and held everything up for a third of a
     * second on each new scene.
     */
    const thumbnail = new Image();
    thumbnail.addEventListener("load", () => {
        if (!thumbnail.naturalWidth) return;
        // The new map's light fades in over the last one's
        front = 1 - front;
        sample(thumbnail, false);
        sampled = true;
        last_look = "";
        request();
    });

    /** The small copy of the map, a video's frames blending into each other */
    function sample(media: HTMLImageElement | HTMLVideoElement, blend: boolean) {
        const { width, height } = size_of(media);
        const sample_height = Math.max(8, Math.min(160, Math.round((SAMPLE * height) / width)));
        if (base.width !== SAMPLE || base.height !== sample_height) {
            base.width = SAMPLE;
            base.height = sample_height;
            blend = false;
        }
        const ctx = base.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";
        ctx.globalAlpha = blend ? 0.3 : 1;
        ctx.drawImage(media, 0, 0, base.width, base.height);
        ctx.globalAlpha = 1;
        spread();
    }

    /** The edges stretched outwards, then blurred far and a little more colourful */
    function spread() {
        const bw = base.width;
        const bh = base.height;
        const mw = Math.round(bw * MARGIN);
        const mh = Math.round(bh * MARGIN);
        extended.width = glow.width = bw + 2 * mw;
        extended.height = glow.height = bh + 2 * mh;
        const ctx = extended.getContext("2d")!;
        ctx.drawImage(base, mw, mh);
        ctx.drawImage(base, 0, 0, 1, bh, 0, mh, mw, bh);
        ctx.drawImage(base, bw - 1, 0, 1, bh, mw + bw, mh, mw, bh);
        ctx.drawImage(base, 0, 0, bw, 1, mw, 0, bw, mh);
        ctx.drawImage(base, 0, bh - 1, bw, 1, mw, mh + bh, bw, mh);
        ctx.drawImage(base, 0, 0, 1, 1, 0, 0, mw, mh);
        ctx.drawImage(base, bw - 1, 0, 1, 1, mw + bw, 0, mw, mh);
        ctx.drawImage(base, 0, bh - 1, 1, 1, 0, mh + bh, mw, mh);
        ctx.drawImage(base, bw - 1, bh - 1, 1, 1, mw + bw, mh + bh, mw, mh);

        const glow_ctx = glow.getContext("2d")!;
        glow_ctx.clearRect(0, 0, glow.width, glow.height);
        glow_ctx.filter = `blur(${bw / 7}px) saturate(1.6) brightness(${dimming})`;
        glow_ctx.drawImage(extended, 0, 0);
        glow_ctx.filter = "none";

        const average_ctx = average.getContext("2d")!;
        average_ctx.imageSmoothingQuality = "high";
        average_ctx.clearRect(0, 0, 1, 1);
        average_ctx.drawImage(glow, mw, mh, bw, bh, 0, 0, 1, 1);
    }

    /** The light around the map where it is on the screen now */
    function draw(rect: DOMRect) {
        const canvas = canvases[front];
        if (!canvas) return;
        const width = 160;
        const height = Math.max(1, Math.round((width * innerHeight) / Math.max(1, innerWidth)));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        for (const layer of [light, falloff]) {
            if (layer.width !== width || layer.height !== height) {
                layer.width = width;
                layer.height = height;
            }
        }
        // The map in the small picture
        const x = (rect.left / innerWidth) * width;
        const y = (rect.top / innerHeight) * height;
        const w = (rect.width / innerWidth) * width;
        const h = (rect.height / innerHeight) * height;

        // Far from the map its average colour, dark
        const ctx = canvas.getContext("2d")!;
        ctx.globalCompositeOperation = "copy";
        ctx.filter = "brightness(0.5)";
        ctx.drawImage(average, 0, 0, width, height);
        ctx.filter = "none";

        // Closer its edges glow, fading with the distance
        const light_ctx = light.getContext("2d")!;
        light_ctx.globalCompositeOperation = "copy";
        const mw = (glow.width - base.width) / 2;
        const mh = (glow.height - base.height) / 2;
        const scale_x = w / base.width;
        const scale_y = h / base.height;
        light_ctx.drawImage(
            glow,
            x - mw * scale_x,
            y - mh * scale_y,
            glow.width * scale_x,
            glow.height * scale_y,
        );
        const falloff_ctx = falloff.getContext("2d")!;
        falloff_ctx.clearRect(0, 0, width, height);
        falloff_ctx.filter = `blur(${width / 5}px)`;
        falloff_ctx.fillStyle = "#fff";
        const reach = width * 0.06;
        falloff_ctx.fillRect(x - reach, y - reach, w + 2 * reach, h + 2 * reach);
        falloff_ctx.filter = "none";
        light_ctx.globalCompositeOperation = "destination-in";
        light_ctx.drawImage(falloff, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(light, 0, 0);

        // A soft shadow right around the map, it floats over its light
        ctx.filter = `blur(${width / 70}px)`;
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        const lift = width * 0.006;
        ctx.fillRect(x - lift, y - lift, w + 2 * lift, h + 2 * lift);
        ctx.filter = "none";
    }

    /** Looks where the map is on the next frame, drawing the light if it moved */
    function request() {
        if (!frame) frame = requestAnimationFrame(update);
    }

    function update() {
        frame = 0;
        if (!appState.ambient || !sampled || document.hidden) return;
        const media = map_media();
        if (!media) return;
        watch(media);
        const rect = media.getBoundingClientRect();
        const look = `${rect.left}|${rect.top}|${rect.width}|${rect.height}|${innerWidth}|${innerHeight}`;
        if (look === last_look) return;
        last_look = look;
        draw(rect);
    }

    // Only when something may have moved the map its place is looked up: on every frame
    // that made the page lay itself out again, for each figure moving
    const resized = new ResizeObserver(request);
    const restyled = new MutationObserver(request);
    function watch(media: Element) {
        if (media === watched) return;
        watched = media;
        resized.disconnect();
        restyled.disconnect();
        resized.observe(media);
        // Zooming and panning move the map by the style of the elements around it
        for (let element = media.parentElement, i = 0; element && i < 3; element = element.parentElement, i++) {
            restyled.observe(element, { attributes: true, attributeFilter: ["style"] });
        }
    }

    $effect(() => {
        const file = gameState.scene?.map;
        if (!appState.ambient || !file || file === shown_file) return;
        shown_file = file;
        thumbnail.src = asset_url(`${file}_thumbnail.webp`);
    });

    $effect(() => {
        appState.zoom;
        appState.layout_zoom;
        appState.ambient;
        request();
    });

    // A darker or brighter scene spreads the light again
    $effect(() => {
        dimming;
        if (untrack(() => sampled)) {
            spread();
            last_look = "";
            request();
        }
    });

    onMount(() => {
        const options = { passive: true, capture: true };
        addEventListener("scroll", request, options);
        addEventListener("resize", request, options);
        // A video map's frames now and then, its light flickers along slowly
        const video_timer = setInterval(() => {
            const media = map_media();
            if (
                !appState.ambient ||
                !sampled ||
                document.hidden ||
                !(media instanceof HTMLVideoElement) ||
                media.paused ||
                media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
                !media.videoWidth
            ) {
                return;
            }
            sample(media, true);
            last_look = "";
            request();
        }, VIDEO_EVERY);
        return () => {
            removeEventListener("scroll", request, options);
            removeEventListener("resize", request, options);
            clearInterval(video_timer);
            resized.disconnect();
            restyled.disconnect();
            cancelAnimationFrame(frame);
        };
    });
</script>

{#if appState.ambient && gameState.scene}
    <!-- Above the page's background, under all that comes after it on the page: a
         negative z-index would put it under the body's background -->
    <div class="ambient fixed inset-0 pointer-events-none" aria-hidden="true">
        {#each [0, 1] as index (index)}
            <canvas
                bind:this={canvases[index]}
                class="absolute inset-0 w-full h-full"
                style:opacity={front === index ? 1 : 0}
            ></canvas>
        {/each}
        <!-- Darker towards the corners, the eye stays on the map -->
        <div class="vignette absolute inset-0"></div>
    </div>
{/if}

<style>
    canvas {
        transition: opacity 1.4s ease-in-out;
    }

    .vignette {
        background: radial-gradient(
            ellipse at center,
            transparent 55%,
            rgba(0, 0, 0, 0.12) 80%,
            rgba(0, 0, 0, 0.3) 100%
        );
    }
</style>
