<script lang="ts">
    import { onDestroy } from "svelte";
    import { fade } from "svelte/transition";
    import { rollState } from "$lib/state.svelte";
    import type { RollMode } from "$lib/rolls";

    const { roll_callback } = $props();
    type Dice = "d4" | "d6" | "d8" | "d100" | "d10" | "d12" | "d20";

    let dice_count: Record<Dice, number> = $state({
        d20: 0,
        d12: 0,
        d10: 0,
        d100: 0,
        d8: 0,
        d6: 0,
        d4: 0,
    });

    let entries = $derived(Object.entries(dice_count)) as [Dice, number][];
    let chosen = $derived(Object.values(dice_count).reduce((sum, count) => sum + count, 0));
    let privacy_level = $state("public");

    function reset() {
        for (const key of Object.keys(dice_count)) {
            dice_count[key as Dice] = 0;
        }
    }

    function toggle_mode(mode: RollMode) {
        rollState.mode = rollState.mode === mode ? "normal" : mode;
    }

    /**
     * The dice open above the button with a click or tap and close with another or one
     * next to them. Everything they need is in there: beside the button, advantage and
     * the roll button pushed the reactions aside. The controls make way meanwhile.
     */
    let opened = $state(false);
    let chooser: HTMLDivElement | null = $state(null);

    function set_open(open: boolean) {
        opened = open;
        rollState.choosing = open;
    }

    function roll() {
        roll_callback(
            entries
                .filter(([_, value]) => value > 0)
                .map(([key, value]) => value.toString() + key),
            privacy_level,
        );
        reset();
        set_open(false);
    }

    onDestroy(() => (rollState.choosing = false));
</script>

<svelte:window
    onpointerdown={(event) => {
        if (opened && chooser && !chooser.contains(event.target as Node)) set_open(false);
    }}
    onkeydown={(event) => {
        if (opened && event.key === "Escape") set_open(false);
    }}
/>

<div
    class="dropdown dropdown-top {opened ? 'dropdown-open' : 'dropdown-close'}"
    transition:fade={{ duration: 200 }}
    bind:this={chooser}
>
    <!-- The dice chosen and not rolled yet, with the menu closed -->
    <div class="indicator">
        {#if !opened && chosen > 0}
            <span class="indicator-item badge badge-sm badge-info">{chosen}</span>
        {/if}
        <button
            class="btn rounded-full w-12 h-12 p-0 flex justify-center items-center {rollState.mode ===
            'advantage'
                ? 'ring-2 ring-success'
                : rollState.mode === 'disadvantage'
                  ? 'ring-2 ring-error'
                  : ''}"
            aria-label="Würfel"
            aria-expanded={opened}
            title={rollState.mode === "advantage"
                ? "Würfel, der nächste W20 mit Vorteil"
                : rollState.mode === "disadvantage"
                  ? "Würfel, der nächste W20 mit Nachteil"
                  : "Würfel"}
            onclick={() => set_open(!opened)}
        >
            <span class="dice-icon d20 !bg-base-content/70"></span>
        </button>
    </div>
    <div
        class="dropdown-content z-1 mb-2 frosted rounded-box shadow-lg p-2 flex flex-col gap-2 w-max max-w-[calc(100vw-var(--corner-left)-var(--corner-right))]"
    >
        <div class="join self-start" role="group" aria-label="Vorteil oder Nachteil">
            <button
                class="btn btn-xs join-item {rollState.mode === 'advantage'
                    ? 'btn-success'
                    : 'btn-ghost'}"
                title="Der nächste W20 wird zweimal gewürfelt, der höhere zählt"
                aria-pressed={rollState.mode === "advantage"}
                onclick={() => toggle_mode("advantage")}
            >
                <i class="fa-solid fa-angles-up"></i> Vorteil
            </button>
            <button
                class="btn btn-xs join-item {rollState.mode === 'disadvantage'
                    ? 'btn-error'
                    : 'btn-ghost'}"
                title="Der nächste W20 wird zweimal gewürfelt, der niedrigere zählt"
                aria-pressed={rollState.mode === "disadvantage"}
                onclick={() => toggle_mode("disadvantage")}
            >
                <i class="fa-solid fa-angles-down"></i> Nachteil
            </button>
        </div>
        <!-- Smaller and wrapping on phones, so all fit on the screen. Room above and to
             the right for the counts. -->
        <ul class="flex flex-row flex-wrap gap-2 max-sm:gap-1.5 pt-2 pr-2">
            {#each entries as [dice, count]}
                <li class="indicator">
                    {#if count > 0}
                        <span class="indicator-item badge badge-sm will-change-contents"
                            >{count}</span
                        >
                    {/if}
                    <button
                        class="btn rounded-full w-12 h-12 max-sm:w-11 max-sm:h-11 p-0 flex justify-center items-center"
                        aria-label={dice.toUpperCase()}
                        title={dice.toUpperCase()}
                        onclick={() => {
                            dice_count[dice]++;
                        }}
                        oncontextmenu={(evt) => {
                            evt.preventDefault();
                            count > 0 && dice_count[dice]--;
                        }}
                    >
                        <span class="dice-icon !bg-base-content {dice}"></span>
                    </button>
                </li>
            {/each}
        </ul>
        <!-- Always there, greyed out until dice are chosen: appearing with the first die it
             pushed the dice up, and the second tap on one hit the roll button instead -->
        <div class="flex flex-row gap-1">
            <div class="join flex-1">
                <button
                    class="btn btn-info join-item rounded-l-full flex-1"
                    disabled={chosen === 0}
                    onclick={roll}
                >
                    Würfeln
                </button>
                <select
                    class="select join-item rounded-r-full w-auto bg-base-200 border-base-200 font-semibold"
                    aria-label="Wer das Ergebnis sieht"
                    disabled={chosen === 0}
                    bind:value={privacy_level}
                >
                    <option value="public">Alle</option>
                    <option value="dm">Nur der DM</option>
                    <option value="private">Privat</option>
                </select>
            </div>
            <button
                class="btn btn-ghost btn-square rounded-full"
                aria-label="Zurücksetzen"
                title="Zurücksetzen"
                disabled={chosen === 0}
                onclick={reset}
            >
                <i class="fa-solid fa-rotate-left"></i>
            </button>
        </div>
    </div>
</div>

<style>
    .d20 {
        mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='28' height='31' fill='%23fff' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 0 0 7.5v15.2l14 7.5 13-7 1-.6V7.5L14 0Zm-2 8.3-5.9 8.8-3.7-8 9.6-.8ZM8 18l6-9.1 6 9.1H8Zm13.8-.9L16 8.3l9.5.7-3.7 8.1ZM15 2.8l7.4 4-7.4-.6V2.8Zm-2 0v3.4l-7.4.6 7.4-4Zm-11 10 2.7 6L2 20.4v-7.6Zm1 9.3 2.7-1.6 4.4 5.5L3 22.1ZM8 20h11l-5 7.5L8 20Zm9.9 5.9 4.4-5.5L25 22l-7.1 3.9Zm5.6-7-.2-.1 2.7-6v7.6l-2.5-1.5Z'/%3E%3C/svg%3E");
    }
    .d12 {
        mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='30' height='32' fill='%23fff' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M25 4 15 0 5 4l-5 7v10l6 7 9 4 9-4 6-7V11l-5-7ZM2 11.9 6 14l3.7 8.2-3.4 3.4L2 21v-9.1ZM12 22l-3.7-7.2L15 9.2l6.7 5.5L18 22h-6Zm16-1-4.3 4.7-3.4-3.4L24 14l4-2.1V21ZM16 2.2l7.8 3.6L27 10l-4.5 2.6L16 7.5V2.2ZM6.2 5.8 14 2.2v5.2l-6.5 5.1-.5-.1L3 10l3.2-4.2Zm2.1 21 3-3h7.5l3 3L15 30l-6.7-3.2Z'/%3E%3C/svg%3E");
    }
    .d10 {
        mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='32' height='29' fill='%23fff' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16 0 0 12l1 6 15 11 15-11 1-6L16 0Zm13.7 12.8-.5 3.2-3.5-1.7-5.4-9 9.4 7.5ZM15 19.6v6.1l-11.1-8L7 16.1l8 3.5Zm2 0 8-3.5 3.1 1.6L17 25.8v-6.2Zm6.6-5.1L16 17.9l-7.6-3.4L16 2.9l7.6 11.6ZM2.3 12.8l9.4-7.5-5.4 9L2.8 16l-.5-3.2Z'/%3E%3C/svg%3E");
    }
    .d100 {
        mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='32' height='29' fill='%23fff' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16 0 0 12l1 6 15 11 15-11 1-6L16 0Zm13.7 12.8-.5 3.2-3.5-1.7-5.4-9 9.4 7.5ZM15 19.6v6.1l-11.1-8L7 16.1l8 3.5Zm2 0 8-3.5 3.1 1.6L17 25.8v-6.2Zm6.6-5.1L16 17.9l-7.6-3.4L16 2.9l7.6 11.6ZM2.3 12.8l9.4-7.5-5.4 9L2.8 16l-.5-3.2Z'/%3E%3C/svg%3E");
        mask-repeat: repeat-x !important;
        mask-size: 50% !important;
        mask-position: 0% 50% !important;
    }
    .d8 {
        mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='26' height='31' fill='%23fff' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 0 0 8v13l13 10 13-10V8L13 0Zm11 15.9L17 4.5 24 9v6.9ZM13 2l.1.1L24.2 20H1.8L12.9 2.1 13 2ZM9 4.5 2 15.9V9l7-4.5ZM3.9 22h18.2L13 28.5 3.9 22Z'/%3E%3C/svg%3E");
    }
    .d6 {
        mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='27' height='27' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 6.978h17.602M1 6.978 10.444 1H26M1 6.978V26h17.602m0-19.022L26 1m-7.398 5.978V26M26 1v17.391L18.602 26' stroke='%23fff' stroke-width='1.75'/%3E%3C/svg%3E");
    }
    .d4 {
        mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg width='31' height='27' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14.5 2 2 25.5h22.5M14.5 2l10 23.5M14.5 2l15 11-5 12.5' stroke='%23fff' stroke-width='1.75'/%3E%3C/svg%3E");
    }
    .dice-icon {
        width: 32px;
        height: 32px;
        mask-repeat: no-repeat;
        background: white;
        mask-position: center center;
    }
</style>
