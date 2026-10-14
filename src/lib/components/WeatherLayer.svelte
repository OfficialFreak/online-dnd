<script lang="ts">
    import { play_effect } from "$lib/audio.svelte";
    import { appState } from "$lib/state.svelte";
    import type { Weather } from "$lib/types/messaging/server_messages";
    import { CLEAR, flashes_between, thunder_files, WeatherRenderer } from "$lib/weather";

    /** The weather of the active scene, over the map and its markers but under the controls */
    let { weather }: { weather: Weather | null | undefined } = $props();

    let canvas: HTMLCanvasElement;
    let width = $state(0);
    let height = $state(0);
    let renderer: WeatherRenderer | null = $state.raw(null);
    /** Without weather the canvas leaves the page, a layer over the whole screen costs */
    let active = $state(false);

    // Everyone can turn it off for themselves
    let shown = $derived(appState.show_weather && weather ? weather : CLEAR);
    /** Only turning it on and off starts the lightning anew, the DM's sliders don't */
    let lightning = $derived(shown.lightning);

    /**
     * The map's picture: the rain splashes off its top edge, snow settles there and the
     * lightning strikes behind it
     */
    let map: HTMLElement | null = null;
    function map_box() {
        if (!map?.isConnected) map = document.querySelector<HTMLElement>('[data-map="main"]');
        if (!map) return null;
        const { left, right, top, bottom } = map.getBoundingClientRect();
        return { left, right, top, bottom };
    }

    $effect(() => {
        const created = new WeatherRenderer(canvas, {
            // Phones get fewer particles
            lite: matchMedia("(pointer: coarse)").matches,
            calm: matchMedia("(prefers-reduced-motion: reduce)").matches,
            on_active: (value) => (active = value),
            map: map_box,
        });
        renderer = created;
        return () => created.destroy();
    });

    $effect(() => {
        renderer?.resize(width, height);
    });

    $effect(() => {
        renderer?.set(shown);
    });

    // Lightning at the same moments on every screen, the thunder a few seconds later: one
    // of the DM's, on every screen the same
    $effect(() => {
        if (!lightning) return;
        let last = Date.now();
        const thunders = new Set<ReturnType<typeof setTimeout>>();
        const interval = setInterval(() => {
            const now = Date.now();
            // Back from the background, the missed ones don't all come at once
            if (now - last > 2000) last = now - 250;
            for (const flash of flashes_between(last, now, shown.lightning_rate)) {
                renderer?.flash(flash);
                const files = thunder_files(weather);
                if (!files.length) continue;
                const file = files[Math.floor(flash.pick * files.length)];
                const thunder = setTimeout(() => {
                    thunders.delete(thunder);
                    play_effect("Donner", file, flash.loudness);
                }, flash.thunder_delay);
                thunders.add(thunder);
            }
            last = now;
        }, 100);
        return () => {
            clearInterval(interval);
            thunders.forEach(clearTimeout);
        };
    });
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<canvas
    bind:this={canvas}
    class="fixed inset-0 z-0 w-full h-full pointer-events-none"
    style:display={active ? null : "none"}
    aria-hidden="true"
></canvas>
