<script lang="ts">
    import { onMount } from "svelte";
    // @ts-ignore
    import DiceBox from "@3d-dice/dice-box";
    // @ts-ignore
    import confetti from "canvas-confetti";
    import { roller, rollState } from "../state.svelte";
    import {
        bonus_string as format_bonus,
        mode_label,
        type RollMode,
        type RollOutcome,
    } from "../rolls";

    const poop = confetti.shapeFromText({ text: "💩", scalar: 8 });
    let confetti_canvas: HTMLCanvasElement | null = $state(null);
    let diceBox: DiceBox | null = $state(null);
    let modal: HTMLDialogElement | null = $state(null);
    let dice_values: string = $state("");
    let roll_result: number = $state(-1);
    let rolls: string[] = $state([]);
    let bonus: number = $state(0);
    let mode = $state<RollMode>("normal");
    /** Both d20s of a roll with advantage or disadvantage, the first one counts with advantage */
    let d20s: number[] = $state([]);
    /** The d20 that counts */
    let kept_d20 = $derived(
        mode === "advantage" ? Math.max(...d20s) : Math.min(...d20s),
    );
    let single_roll = $derived(
        rolls.length === 1 && rolls[0].substring(0, 2) === "1d",
    );
    onMount(() => {
        diceBox = new DiceBox({
            container: "#diceroller",
            assetPath: "/assets/",
            themeColor: "#aa55aa",
            scale: 5,
        });
        let confetti_function = confetti.create(confetti_canvas, {
            resize: true,
        });
        diceBox.onRollComplete = (results: any) => {
            // With advantage or disadvantage the d20 was rolled twice, only one of them counts
            const groups: number[][] = results.map(
                (dice: {
                    sides?: number | string;
                    rolls: { value: number; sides?: number | string }[];
                }) => {
                    const values = dice.rolls.map((roll) => roll.value);
                    const sides = Number(dice.sides ?? dice.rolls[0]?.sides);
                    if (
                        mode !== "normal" &&
                        sides === 20 &&
                        values.length === 2
                    ) {
                        d20s = values;
                        return [
                            mode === "advantage"
                                ? Math.max(...values)
                                : Math.min(...values),
                        ];
                    }
                    return values;
                },
            );
            dice_values = groups
                .map((values) => values.join(" + "))
                .join(" + ");
            roll_result = groups.flat().reduce((sum, value) => sum + value, 0);

            // Celebration
            if (
                single_roll &&
                (rolls[0] === "1d20" || rolls[0] === "d20") &&
                roll_result === 20
            ) {
                confetti_function({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 2 },
                });
            }
            // Added physcological damage
            if (
                single_roll &&
                (rolls[0] === "1d20" || rolls[0] === "d20") &&
                roll_result === 1
            ) {
                confetti_function({
                    particleCount: 100,
                    spread: 70,
                    scalar: 4,
                    origin: { y: 2 },
                    shapes: [poop],
                });
            }
            modal?.showModal();
        };

        diceBox.init();
    });

    roller.value = async function roll(
        new_rolls: string[],
        new_bonus: number,
    ): Promise<RollOutcome> {
        // Advantage and disadvantage need exactly one d20, which uses them up
        const d20_index = new_rolls.findIndex(
            (notation) => notation === "1d20" || notation === "d20",
        );
        const new_mode =
            d20_index === -1 ||
            new_rolls.some(
                (notation, i) => i !== d20_index && notation.endsWith("d20"),
            )
                ? "normal"
                : rollState.mode;
        if (new_mode !== "normal") rollState.mode = "normal";

        const rollComplete = new Promise<void>((resolve) => {
            const originalHandler = diceBox.onRollComplete;

            // Temporary one-time handler
            diceBox.onRollComplete = (results: any) => {
                if (originalHandler) originalHandler(results);
                resolve();
                diceBox.onRollComplete = originalHandler;
            };
        });
        rolls = new_rolls;
        bonus = new_bonus;
        mode = new_mode;
        d20s = [];
        await diceBox.roll(
            new_mode === "normal"
                ? new_rolls
                : new_rolls.map((notation, i) =>
                      i === d20_index ? "2d20" : notation,
                  ),
        );
        await rollComplete;
        return {
            dice_values: dice_values,
            roll_result: roll_result,
            single_roll: single_roll,
            mode: mode,
            d20s: [...d20s],
        };
    };

    let bonus_string = $derived(format_bonus(roll_result, bonus));
</script>

<!-- This should be fine as there will only be one dice-roller -->
<div
    id="diceroller"
    class="w-screen h-full fixed top-0 left-0 z-10 pointer-events-none overflow-hidden scrollbar-gutter-affected"
></div>
<dialog
    bind:this={modal}
    onclose={() => {
        diceBox.clear();
    }}
    class="modal"
>
    <div class="modal-box flex flex-col items-center">
        <canvas
            bind:this={confetti_canvas}
            class="absolute top-0 left-0 w-full h-full"
        ></canvas>
        {#if single_roll}
            <h3 class="text-7xl font-bold flex">
                {roll_result}{bonus_string}
            </h3>
        {:else}
            <h3 class="text-5xl font-bold flex flex-wrap justify-center gap-2">
                <span class="text-gray-500">{dice_values}</span><span
                    class="whitespace-nowrap"
                    >= {roll_result}{bonus_string}</span
                >
            </h3>
        {/if}
        {#if mode !== "normal" && d20s.length === 2}
            <p
                class="mt-2 text-xl {mode === 'advantage'
                    ? 'text-success'
                    : 'text-error'}"
            >
                {mode_label(mode)}:
                {#each d20s as value, i}
                    {#if i > 0}<span class="mx-1 text-base-content/40">|</span
                        >{/if}
                    <span
                        class={value === kept_d20 && d20s.indexOf(value) === i
                            ? "font-bold"
                            : "line-through text-base-content/40"}>{value}</span
                    >
                {/each}
            </p>
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0">close</button>
    </form>
</dialog>

<style>
    :global(.dice-box-canvas) {
        width: 100% !important;
        height: 100% !important;
    }
</style>
