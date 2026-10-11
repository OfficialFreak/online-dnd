<script lang="ts">
    import {
        DICE_COLORS,
        DICE_THEMES,
        diceSkin,
        set_dice_skin,
        theme_preview,
    } from "$lib/dice-skins.svelte";
</script>

<div class="flex flex-col gap-3">
    <div class="grid grid-cols-5 gap-2">
        {#each DICE_THEMES as entry (entry.theme)}
            {@const selected = diceSkin.theme === entry.theme}
            <button
                class="flex flex-col items-center gap-1 p-1.5 rounded-box border-2 transition-colors cursor-pointer {selected
                    ? 'border-info bg-info/10'
                    : 'border-transparent bg-base-content/5 hover:bg-base-content/10'}"
                aria-pressed={selected}
                onclick={() => set_dice_skin({ theme: entry.theme })}
            >
                <img
                    class="w-14 h-14 object-contain drop-shadow-md"
                    src={theme_preview(entry, diceSkin.color)}
                    alt=""
                />
                <span
                    class="w-full text-xs font-semibold leading-tight text-center break-words hyphens-auto"
                    lang="de">{entry.label}</span
                >
            </button>
        {/each}
    </div>
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
</div>
