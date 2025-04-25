<script lang="ts">
    import { onMount } from "svelte";
    // @ts-ignore
    import DiceBox from "@3d-dice/dice-box";
    // @ts-ignore
    import confetti from "canvas-confetti";
    import { roller } from "../state.svelte";

    const poop = confetti.shapeFromText({ text: "💩", scalar: 8 });
    let confetti_canvas: HTMLCanvasElement | null = $state(null);
    let diceBox: DiceBox | null = $state(null);
    let modal: HTMLDialogElement | null = $state(null);
    let dice_values: string = $state("");
    let roll_result: number = $state(-1);
    let rolls: string[] = $state([]);
    let bonus: number = $state(0);
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
            dice_values = results
                .map((dice: { rolls: { value: number }[] }) => {
                    return dice.rolls.map((roll) => roll.value).join(" + ");
                })
                .join(" + ");
            roll_result = results.reduce(
                (sum: number, dice: { rolls: { value: number }[] }) => {
                    const diceTotal = dice.rolls.reduce(
                        (acc, roll) => acc + roll.value,
                        0,
                    );
                    return sum + diceTotal;
                },
                0,
            );

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

    roller.value = async function roll(new_rolls: string[], new_bonus: number) {
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
        await diceBox.roll(rolls);
        await rollComplete;
        return {
            dice_values: dice_values,
            roll_result: roll_result,
            single_roll: single_roll,
        };
    };

    let bonus_string = $derived(
        bonus === 0
            ? ""
            : bonus > 0
              ? ` + ${bonus} = ${roll_result + bonus}`
              : ` - ${bonus * -1} = ${roll_result + bonus}`,
    );
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
    <div class="modal-box flex justify-center">
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
