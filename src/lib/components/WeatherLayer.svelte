<script lang="ts">
    import { appState } from "$lib/state.svelte";
    import type { Weather } from "$lib/types/messaging/server_messages";
    import { CLEAR, WeatherRenderer } from "$lib/weather";

    /** The weather of the active scene, over the map and its markers but under the controls */
    let { weather }: { weather: Weather | null | undefined } = $props();

    let canvas: HTMLCanvasElement;
    let width = $state(0);
    let height = $state(0);
    let renderer: WeatherRenderer | null = $state.raw(null);

    $effect(() => {
        const created = new WeatherRenderer(canvas, {
            // Phones get fewer particles
            lite: matchMedia("(pointer: coarse)").matches,
            calm: matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        renderer = created;
        return () => created.destroy();
    });

    $effect(() => {
        renderer?.resize(width, height);
    });

    $effect(() => {
        // Everyone can turn it off for themselves
        renderer?.set(appState.show_weather && weather ? weather : CLEAR);
    });
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<canvas
    bind:this={canvas}
    class="fixed inset-0 z-0 w-full h-full pointer-events-none"
    aria-hidden="true"
></canvas>
