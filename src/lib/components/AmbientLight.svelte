<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { appState, gameState } from "$lib/state.svelte";
    import { asset_url } from "$lib/assets";
    import { billows, smoothstep } from "$lib/noise";

    /**
     * The map's colours around it, like the ambient mode of YouTube: its edges stretched
     * outwards and blurred far, so every colour at its edge bleeds into the background.
     * Behind everything, also behind a background image where that leaves gaps. Follows
     * the map when it moves or zooms, the frames of a video map, and dims in dark scenes.
     */

    /** Width of the small copy of the map the light is made from */
    const SAMPLE = 48;
    /** How far the edges reach out, in sizes of the map */
    const MARGIN = 2.5;
    /**
     * How often a video map is looked at again, in milliseconds. Each look scales a frame
     * of up to 4K down on the graphics card, at 15 a second that kept it busy a quarter
     * of the time.
     */
    const VIDEO_EVERY = 500;

    /** Two take turns, so a new map's light fades in over the last one's */
    let canvases: HTMLCanvasElement[] = $state([]);
    let front = $state(0);
    /**
     * A fine grain over the light, like film. A tile drawn once, a layer the graphics card
     * only puts on top: in the light itself, a tenth as large as the screen, it would
     * blur away.
     */
    let grain = $state("");
    /** The map fills the screen, nothing of the light shows and it isn't drawn */
    let covered = $state(false);

    const base = document.createElement("canvas");
    const extended = document.createElement("canvas");
    /**
     * The edges' colours blurred wide, and only a little for right beside the map, each
     * already fading with the distance from the map
     */
    const glow = document.createElement("canvas");
    const glow_near = document.createElement("canvas");
    const average = document.createElement("canvas");
    average.width = average.height = 1;
    /** What fades them, made once for the map's shape */
    const far_mask = document.createElement("canvas");
    const near_mask = document.createElement("canvas");
    let mask_shape = "";
    /** Soft clouds over the light, so it isn't one smooth colour */
    const clouds = document.createElement("canvas");

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

    /**
     * Whether canvas filters draw. Safari has none: its light was the map's edges stretched
     * sharp, too bright and not fading. The light softens without them now, only the
     * extra colour needs them.
     */
    const filters_work = (() => {
        try {
            const test = document.createElement("canvas");
            test.width = test.height = 1;
            const ctx = test.getContext("2d", { willReadFrequently: true })!;
            ctx.filter = "brightness(0)";
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, 1, 1);
            return ctx.getImageData(0, 0, 1, 1).data[0] < 128;
        } catch {
            return false;
        }
    })();

    /** Smaller and smaller copies and back up, see blur */
    const halves: HTMLCanvasElement[] = [];
    const doubles: HTMLCanvasElement[] = [];

    function resample(
        pool: HTMLCanvasElement[],
        index: number,
        from: HTMLCanvasElement,
        width: number,
        height: number,
    ) {
        const next = (pool[index] ??= document.createElement("canvas"));
        next.width = Math.max(1, Math.round(width));
        next.height = Math.max(1, Math.round(height));
        const ctx = next.getContext("2d")!;
        ctx.imageSmoothingQuality = "high";
        ctx.clearRect(0, 0, next.width, next.height);
        ctx.drawImage(from, 0, 0, next.width, next.height);
        return next;
    }

    /**
     * Blurs a picture by halving it a few times and doubling it back step by step, the
     * browser smooths it out at each step. A blur that every browser draws. Drawn large
     * in one step, the few pixels left showed as blotches.
     */
    function blur(source: HTMLCanvasElement, times: number) {
        let current = source;
        for (let i = 0; i < times; i++) {
            current = resample(halves, i, current, current.width / 2, current.height / 2);
        }
        for (let i = times - 1; i >= 0; i--) {
            const size = i === 0 ? source : halves[i - 1];
            current = resample(doubles, i, current, size.width, size.height);
        }
        return current;
    }

    /** A blurred copy a little more colourful, darker in a dark scene, faded by the mask */
    function tint(target: HTMLCanvasElement, source: HTMLCanvasElement, mask: HTMLCanvasElement) {
        target.width = source.width;
        target.height = source.height;
        const ctx = target.getContext("2d")!;
        ctx.clearRect(0, 0, target.width, target.height);
        if (filters_work) ctx.filter = "saturate(1.6)";
        ctx.drawImage(source, 0, 0);
        ctx.filter = "none";
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = `rgba(0, 0, 0, ${1 - dimming})`;
        ctx.fillRect(0, 0, target.width, target.height);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = "source-over";
    }

    /**
     * How strongly the light shows around the map, by the distance to it: right beside it
     * the colours of its edge, fading within a few steps of the map, and its wide glow
     * fading slowly over about a map's size. Made once for the map's shape and drawn with
     * the light: worked out anew on every step of panning and zooming, it held up the
     * frames in Firefox.
     */
    function fade_masks(bw: number, bh: number, mw: number, mh: number) {
        const shape = `${bw}x${bh}`;
        if (shape === mask_shape) return;
        mask_shape = shape;
        const width = bw + 2 * mw;
        const height = bh + 2 * mh;
        far_mask.width = near_mask.width = width;
        far_mask.height = near_mask.height = height;
        const far = new ImageData(width, height);
        const near = new ImageData(width, height);
        far.data.fill(255);
        near.data.fill(255);
        const far_reach = Math.min(1.2 * Math.max(bw, bh), 0.95 * Math.min(mw, mh));
        const near_reach = 0.12 * Math.max(bw, bh);
        for (let row = 0; row < height; row++) {
            const cy = row + 0.5;
            const dy = Math.max(mh - cy, 0, cy - (mh + bh));
            for (let column = 0; column < width; column++) {
                const cx = column + 0.5;
                const dx = Math.max(mw - cx, 0, cx - (mw + bw));
                const distance = Math.sqrt(dx * dx + dy * dy);
                const i = (row * width + column) * 4 + 3;
                far.data[i] = 255 * (1 - smoothstep(0, far_reach, distance));
                near.data[i] = 255 * (1 - smoothstep(0, near_reach, distance));
            }
        }
        far_mask.getContext("2d")!.putImageData(far, 0, 0);
        near_mask.getContext("2d")!.putImageData(near, 0, 0);
    }

    /**
     * The edges stretched outwards and blurred: far for the light around the map, a little
     * for right beside it, where the light takes up the colours at the map's edge
     */
    function spread() {
        const bw = base.width;
        const bh = base.height;
        const mw = Math.round(bw * MARGIN);
        const mh = Math.round(bh * MARGIN);
        extended.width = bw + 2 * mw;
        extended.height = bh + 2 * mh;
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

        fade_masks(bw, bh, mw, mh);
        tint(glow, blur(extended, 4), far_mask);
        tint(glow_near, blur(extended, 1), near_mask);

        const average_ctx = average.getContext("2d")!;
        average_ctx.imageSmoothingQuality = "high";
        average_ctx.clearRect(0, 0, 1, 1);
        average_ctx.drawImage(glow, mw, mh, bw, bh, 0, 0, 1, 1);
    }

    /**
     * Soft clouds of lighter and darker, a few across the screen. Drawn once for the size
     * of the light, they stay in place while the map moves. See-through light and dark
     * instead of a blend mode, which Firefox can't draw on the graphics card.
     */
    function cloud_layer(width: number, height: number) {
        if (clouds.width === width && clouds.height === height) return clouds;
        clouds.width = width;
        clouds.height = height;
        const ctx = clouds.getContext("2d")!;
        const pixels = ctx.createImageData(width, height);
        const scale = 4.5 / width;
        for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
                const offset = billows(column * scale + 11.3, row * scale + 5.7, 3) - 0.5;
                const i = (row * width + column) * 4;
                const shade = offset > 0 ? 255 : 0;
                pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade;
                pixels.data[i + 3] = Math.min(64, Math.abs(offset) * (offset > 0 ? 130 : 260));
            }
        }
        ctx.putImageData(pixels, 0, 0);
        return clouds;
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
        // The map in the small picture
        const x = (rect.left / innerWidth) * width;
        const y = (rect.top / innerHeight) * height;
        const w = (rect.width / innerWidth) * width;
        const h = (rect.height / innerHeight) * height;

        // Far from the map its average colour, dark. Without transparency the graphics
        // card can leave out what lies under it.
        const ctx = canvas.getContext("2d", { alpha: false })!;
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(average, 0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, width, height);

        // Closer its edges glow, fading with the distance. Right beside the map the
        // colours of its edge, the map seems to go on into its light. No shadow around
        // the map, a dark rim showed where the map ended and its light began.
        const mw = (glow.width - base.width) / 2;
        const mh = (glow.height - base.height) / 2;
        const scale_x = w / base.width;
        const scale_y = h / base.height;
        for (const source of [glow, glow_near]) {
            ctx.drawImage(
                source,
                x - mw * scale_x,
                y - mh * scale_y,
                source.width * scale_x,
                source.height * scale_y,
            );
        }

        // Soft clouds in it
        ctx.drawImage(cloud_layer(width, height), 0, 0);

        // Darker towards the corners, the eye stays on the map. Drawn in here instead of
        // as a layer of its own over the whole screen.
        ctx.setTransform((width / 2) * Math.SQRT2, 0, 0, (height / 2) * Math.SQRT2, width / 2, height / 2);
        const vignette = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        vignette.addColorStop(0.55, "rgba(0, 0, 0, 0)");
        vignette.addColorStop(0.8, "rgba(0, 0, 0, 0.12)");
        vignette.addColorStop(1, "rgba(0, 0, 0, 0.3)");
        ctx.fillStyle = vignette;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /**
     * Looks where the map is once the next frame is drawn, drawing the light if it moved.
     * Asked before, the page laid itself out once more on every step of a zoom.
     */
    function request() {
        if (!frame) frame = requestAnimationFrame(() => setTimeout(update, 0));
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
        // Zoomed in the map fills the screen: the light would be drawn for nothing on
        // every step of panning, and the graphics card would still put it under the map
        covered =
            rect.left <= 0 &&
            rect.top <= 0 &&
            rect.right >= innerWidth &&
            rect.bottom >= innerHeight;
        if (!covered) draw(rect);
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
        const tile = document.createElement("canvas");
        tile.width = tile.height = 128;
        const tile_ctx = tile.getContext("2d")!;
        const speckles = tile_ctx.createImageData(128, 128);
        for (let i = 0; i < speckles.data.length; i += 4) {
            const shade = Math.random() < 0.5 ? 255 : 0;
            speckles.data[i] = speckles.data[i + 1] = speckles.data[i + 2] = shade;
            speckles.data[i + 3] = Math.random() * (shade ? 9 : 17);
        }
        tile_ctx.putImageData(speckles, 0, 0);
        let grain_url = "";
        tile.toBlob((blob) => {
            if (blob) grain = grain_url = URL.createObjectURL(blob);
        });

        const options = { passive: true, capture: true };
        addEventListener("scroll", request, options);
        addEventListener("resize", request, options);
        // A video map's frames now and then, its light flickers along slowly
        const video_timer = setInterval(() => {
            const media = map_media();
            if (
                !appState.ambient ||
                !sampled ||
                covered ||
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
            if (grain_url) URL.revokeObjectURL(grain_url);
        };
    });
</script>

{#if appState.ambient && gameState.scene}
    <!-- Above the page's background, under all that comes after it on the page: a
         negative z-index would put it under the body's background -->
    <div
        class="ambient fixed inset-0 pointer-events-none"
        class:covered
        aria-hidden="true"
    >
        {#each [0, 1] as index (index)}
            <canvas
                bind:this={canvases[index]}
                class="absolute inset-0 w-full h-full {front === index ? '' : 'behind'}"
            ></canvas>
        {/each}
        {#if grain}
            <div class="grain absolute inset-0" style="background-image: url({grain})"></div>
        {/if}
    </div>
{/if}

<style>
    canvas {
        transition:
            opacity 1.4s ease-in-out,
            visibility 0s;
    }

    .grain {
        background-size: 128px 128px;
    }

    .covered {
        visibility: hidden;
    }

    /* The last map's light fades out, then leaves the screen to the graphics card */
    .behind {
        opacity: 0;
        visibility: hidden;
        transition:
            opacity 1.4s ease-in-out,
            visibility 0s 1.4s;
    }
</style>
