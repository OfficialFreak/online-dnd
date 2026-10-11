<script lang="ts">
    import {
        DICE_COLORS,
        DICE_THEMES,
        diceSkin,
        set_dice_skin,
        theme_preview,
    } from "$lib/dice-skins.svelte";

    /** Throws a die in the chosen look */
    let { on_try }: { on_try: () => void } = $props();

    let colorable = $derived(
        DICE_THEMES.find((entry) => entry.theme === diceSkin.theme)
            ?.colorable ?? false,
    );
</script>

<div class="flex flex-col gap-3">
    <div class="grid grid-cols-3 gap-2">
        {#each DICE_THEMES as entry (entry.theme)}
            {@const selected = diceSkin.theme === entry.theme}
            <button
                class="flex flex-col items-center gap-1.5 p-2 rounded-box border-2 transition-colors cursor-pointer {selected
                    ? 'border-info bg-info/10'
                    : 'border-transparent bg-base-content/5 hover:bg-base-content/10'}"
                aria-pressed={selected}
                onclick={() => set_dice_skin({ theme: entry.theme })}
            >
                <span class="die-shadow">
                    <span
                        class="die block w-12 h-12"
                        style={theme_preview(entry, diceSkin.color)}
                    ></span>
                </span>
                <span class="text-xs font-semibold leading-tight text-center"
                    >{entry.label}</span
                >
            </button>
        {/each}
    </div>
    {#if colorable}
        <div class="flex flex-row flex-wrap items-center gap-1.5">
            {#each DICE_COLORS as color}
                <button
                    class="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer {diceSkin.color ===
                    color
                        ? 'border-info scale-110'
                        : 'border-base-content/20'}"
                    style="background: {color}"
                    aria-label="Würfelfarbe {color}"
                    onclick={() => set_dice_skin({ color })}
                ></button>
            {/each}
            <label
                class="relative w-7 h-7 rounded-full border-2 cursor-pointer overflow-hidden transition-transform hover:scale-110 {DICE_COLORS.includes(
                    diceSkin.color,
                )
                    ? 'border-base-content/20'
                    : 'border-info scale-110'}"
                title="Eigene Farbe"
                style="background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red)"
            >
                <input
                    type="color"
                    class="absolute inset-0 opacity-0 cursor-pointer"
                    value={diceSkin.color}
                    onchange={(event) =>
                        set_dice_skin({ color: event.currentTarget.value })}
                />
            </label>
        </div>
    {:else}
        <p class="text-xs text-base-content/50">
            Diese Würfel haben ihre eigenen Farben.
        </p>
    {/if}
    <button class="btn btn-sm btn-soft btn-info self-start" onclick={on_try}>
        <i class="fa-solid fa-dice-d20"></i> Ausprobieren
    </button>
</div>

<style>
    /* A d20 seen from above: a hexagon with the texture of the dice */
    .die {
        clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
        background-size: 260%;
        background-position: 35% 30%;
        background-repeat: no-repeat;
    }

    .die-shadow {
        filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.45));
    }
</style>
