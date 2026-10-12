<script lang="ts">
    import { appState, gameState } from "$lib/state.svelte";
    import { SetWeather } from "$lib/types/messaging/client_messages";
    import type { Weather } from "$lib/types/messaging/server_messages";
    import { CLEAR, PRESETS } from "$lib/weather";
    import throttle from "just-throttle";

    let weather: Weather = $derived({ ...CLEAR, ...(gameState.scene?.weather ?? {}) });

    // Dragging a slider sends a few times a second, not on every step
    const send = throttle(
        (weather: Weather) => appState.ws?.send(SetWeather.create(weather)),
        150,
        { trailing: true },
    );

    function change(update: Partial<Weather>) {
        if (!gameState.scene) return;
        const next = { ...weather, ...update };
        // Here right away, for everyone once the server sends it on
        gameState.scene.weather = next;
        send(next);
    }

    function matches(a: Weather, b: Weather) {
        return (
            (["rain", "snow", "fog", "wind"] as const).every(
                (key) => Math.abs(a[key] - b[key]) < 0.01,
            ) && a.lightning === b.lightning
        );
    }

    const SLIDERS = [
        { key: "rain", label: "Regen" },
        { key: "snow", label: "Schnee" },
        { key: "fog", label: "Nebel" },
    ] as const;
</script>

<section class="flex flex-col gap-2">
    <h2 class="font-bold">Wetter</h2>
    {#if gameState.scene}
        <div class="flex flex-wrap gap-1">
            {#each PRESETS as preset (preset.label)}
                <button
                    class="btn btn-xs {matches(weather, preset.weather)
                        ? 'btn-info'
                        : 'btn-soft'}"
                    onclick={() => change(preset.weather)}
                >
                    <i class="fa-solid {preset.icon}"></i>
                    {preset.label}
                </button>
            {/each}
        </div>
        {#each SLIDERS as slider (slider.key)}
            <label class="flex items-center gap-2 text-sm">
                <span class="w-14">{slider.label}</span>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    class="range range-xs flex-1"
                    value={weather[slider.key]}
                    oninput={(event) =>
                        change({ [slider.key]: Number(event.currentTarget.value) })}
                />
            </label>
        {/each}
        <label class="flex items-center gap-2 text-sm">
            <span class="w-14">Wind</span>
            <i class="fa-solid fa-arrow-left text-xs opacity-50"></i>
            <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                class="range range-xs flex-1"
                value={weather.wind}
                oninput={(event) =>
                    change({ wind: Number(event.currentTarget.value) })}
            />
            <i class="fa-solid fa-arrow-right text-xs opacity-50"></i>
        </label>
        <label class="flex items-center gap-2 text-sm">
            <input
                type="checkbox"
                class="toggle toggle-sm"
                checked={weather.lightning}
                onchange={(event) =>
                    change({ lightning: event.currentTarget.checked })}
            />
            Blitze
        </label>
    {:else}
        <p class="text-sm text-base-content/60">
            Aktiviere eine Szene, dann kannst du ihr Wetter einstellen.
        </p>
    {/if}
</section>
