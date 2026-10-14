<script lang="ts">
    import { asset_url } from "$lib/assets";
    import { play_effect, weather_sound } from "$lib/audio.svelte";
    import { appState } from "$lib/state.svelte";
    import type {
        Weather,
        WeatherMomentKind,
        WeatherSound,
    } from "$lib/types/messaging/server_messages";
    import {
        CLEAR,
        flashes_between,
        sound_strength,
        thunder_files,
        WEATHER_SOUNDS,
        WeatherRenderer,
        type Flash,
    } from "$lib/weather";
    import { quake_strength, seeded } from "$lib/weather-common";
    import { QUAKE_FOR } from "$lib/weather-moments";
    import { play_clink, play_rumble, prepare_clinks } from "$lib/weather-sounds";

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
    function map_picture() {
        if (!map?.isConnected) map = document.querySelector<HTMLElement>('[data-map="main"]');
        return map;
    }
    function map_box() {
        const picture = map_picture();
        if (!picture) return null;
        const { left, right, top, bottom } = picture.getBoundingClientRect();
        return { left, right, top, bottom };
    }

    $effect(() => {
        const created = new WeatherRenderer(canvas, {
            // Phones get fewer particles
            lite: matchMedia("(pointer: coarse)").matches,
            calm: matchMedia("(prefers-reduced-motion: reduce)").matches,
            on_active: (value) => (active = value),
            map: map_box,
            on_clink: play_clink,
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

    /**
     * When each thunder is over, by its file, in milliseconds since 1970: the same one
     * doesn't roll twice at once. Every screen works it out the same.
     */
    const thunder_ends = new Map<string, number>();
    /** How long each thunder is, in milliseconds, once its file told */
    const thunder_lengths = new Map<string, number>();

    function thunder_length(file: string) {
        if (!thunder_lengths.has(file)) {
            // Until the file tells, about as long as a thunder rolls
            thunder_lengths.set(file, 8000);
            const probe = new Audio();
            probe.preload = "metadata";
            probe.addEventListener(
                "loadedmetadata",
                () => {
                    if (Number.isFinite(probe.duration)) thunder_lengths.set(file, probe.duration * 1000);
                    probe.removeAttribute("src");
                },
                { once: true },
            );
            probe.src = asset_url(file);
        }
        return thunder_lengths.get(file)!;
    }

    /**
     * The thunder to roll at `at`: the one `pick` chose, else the next of them that is
     * over by then, none while all still roll. Marked as rolling until it is over.
     */
    function free_thunder(files: string[], pick: number, at: number) {
        const first = Math.floor(pick * files.length);
        for (let i = 0; i < files.length; i++) {
            const file = files[(first + i) % files.length];
            if ((thunder_ends.get(file) ?? 0) > at) continue;
            thunder_ends.set(file, at + thunder_length(file));
            return file;
        }
        return null;
    }

    /**
     * A near flash lights up for a moment what the figures don't see, see VisionLayer.
     * The DM can turn that off.
     */
    function reveal(samples: number[] | null | undefined, flash: Flash) {
        if (!samples || weather?.lightning_reveals === false) return;
        if (!flash.bolt || flash.distance > 0.4) return;
        const near = 1 - flash.distance;
        window.dispatchEvent(
            new CustomEvent("lightning-reveal", { detail: samples.map((light) => light * near) }),
        );
    }

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
                reveal(renderer?.flash(flash), flash);
                const file = free_thunder(thunder_files(weather), flash.pick, flash.at + flash.thunder_delay);
                if (!file) continue;
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

    /**
     * The ambience going with the weather plays along on each screen, as loud as the
     * weather is strong: the rain harder while a storm passes, the wind in gusts. Also for
     * those who turned the weather off, that only hides it.
     */
    let heard = $derived(weather ?? CLEAR);
    $effect(() => {
        const sounds = heard.sounds ?? {};
        const levels = heard.sound_levels ?? {};
        const file = (kind: WeatherSound) => sounds[kind] || null;
        const play = () => {
            const time = Date.now();
            // As loud as its weather, and as the DM set it relative to the others
            for (const { kind } of WEATHER_SOUNDS) {
                weather_sound(kind, file(kind), sound_strength(heard, kind, time) * (levels[kind] ?? 1));
            }
        };
        play();
        // Often enough for the gusts
        const interval = setInterval(play, 250);
        return () => clearInterval(interval);
    });
    $effect(() => () => {
        for (const kind of ["rain", "wind", "fire"]) weather_sound(kind, null, 0);
    });

    /** The DM's thunderclap: a bolt right overhead and its thunder at once */
    function thunderclap(seed: number, file: string | null | undefined) {
        const next = seeded(seed);
        const flash: Flash = {
            at: Date.now(),
            distance: 0.03,
            thunder_delay: 150,
            loudness: 1,
            bolt: true,
            x: 0.1 + next() * 0.8,
            seed: Math.floor(next() * 2 ** 31),
            pick: 0,
        };
        if (appState.show_weather) reveal(renderer?.flash(flash, true), flash);
        // The DM's choice, else one of the scene's that isn't rolling
        const sound = file ?? free_thunder(thunder_files(weather), next(), Date.now() + flash.thunder_delay);
        if (sound) setTimeout(() => play_effect("Donner", sound, 1), flash.thunder_delay);
    }

    /**
     * The map shakes with the quake, hard at first, less, and once more: what carries it
     * and its figures, the element that moves it. A translation on top of its own, so it
     * stays where it is.
     */
    function shake() {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        let mover = map_picture()?.parentElement ?? null;
        while (mover && !mover.style.transform) mover = mover.parentElement;
        if (!mover) return;
        const frames: Keyframe[] = [];
        // About twelve jerks a second
        const steps = Math.round((QUAKE_FOR / 1000) * 12);
        for (let i = 0; i < steps; i++) {
            const strength = 8 * quake_strength(i / steps);
            const x = (Math.random() - 0.5) * 2 * strength;
            const y = (Math.random() - 0.5) * 2 * strength;
            frames.push({ translate: `${x.toFixed(1)}px ${y.toFixed(1)}px` });
        }
        frames.push({ translate: "0px 0px" });
        mover.animate(frames, { duration: QUAKE_FOR, easing: "linear" });
    }

    // The DM's moments, for everyone at once, see +layout.svelte
    $effect(() => {
        const on_moment = (event: Event) => {
            const { moment, seed, file } = (
                event as CustomEvent<{ moment: WeatherMomentKind; seed: number; file?: string | null }>
            ).detail;
            if (moment === "thunder") return thunderclap(seed, file);
            if (moment === "quake") {
                play_rumble(QUAKE_FOR / 1000);
                if (appState.show_weather) shake();
            }
            if (moment === "gold") prepare_clinks();
            if (appState.show_weather) renderer?.moment(moment, seed);
        };
        window.addEventListener("weather-moment", on_moment);
        return () => window.removeEventListener("weather-moment", on_moment);
    });
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<canvas
    bind:this={canvas}
    class="fixed inset-0 z-0 w-full h-full pointer-events-none"
    style:display={active ? null : "none"}
    aria-hidden="true"
></canvas>
