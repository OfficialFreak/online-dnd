<script lang="ts">
    // Before dice-box: it patches dice-box's physics worker while that loads
    import {
        dice_sync_available,
        finish_recording,
        replay_duration,
        start_recording,
        start_replay,
        stop_replay,
        type DiceReplay,
    } from "../dice-sync";
    import { onMount } from "svelte";
    // @ts-ignore
    import DiceBox from "@3d-dice/dice-box";
    // @ts-ignore
    import confetti from "canvas-confetti";
    import { roller, rollState } from "../state.svelte";
    import { dice_look } from "../dice-skins.svelte";
    import {
        bonus_string as format_bonus,
        mode_label,
        natural_d20,
        roll_detail,
        roll_title,
        roll_total,
        type RollMode,
        type RollOutcome,
    } from "../rolls";
    import { fly, scale } from "svelte/transition";
    import {
        MessageType,
        type AnyRoll,
    } from "$lib/types/messaging/server_messages";

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

    /** Somebody else's roll being shown, with who rolled it and, once the dice landed, what came out */
    let shown_roll: {
        roll: AnyRoll;
        /** The color of the roller's dice */
        color: string;
        landed: boolean;
    } | null = $state(null);
    /** Dice thrown to try out a look, they have no result to show */
    let trying = false;
    /** Called when the dice on screen have all landed */
    let on_landed: (() => void) | null = null;
    /** Rolls of this client, the server sends them back like everyone else's */
    const own_rolls = new Set<string>();

    // Only one roll is on screen at a time, the others wait for their turn
    let queue: Promise<unknown> = Promise.resolve();
    function enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = queue.then(task, task);
        queue = run.catch(() => {});
        return run;
    }

    const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));

    let modal_closed: (() => void) | null = null;

    /** Gives the player a moment to read their own result before other dice come */
    function modal_closes(max_ms: number) {
        if (!modal?.open) return Promise.resolve();
        return Promise.race([
            new Promise<void>((resolve) => (modal_closed = resolve)),
            sleep(max_ms),
        ]);
    }

    /** Throws the dice and waits until they all landed */
    async function throw_dice(
        notation: string[],
        options: { theme?: string; themeColor?: string } = {},
    ) {
        // dice-box only throws dice in themes it loaded before
        let theme = options.theme ?? "default";
        try {
            await diceBox.loadTheme(theme);
        } catch (e) {
            console.error(`Loading the dice theme ${theme} failed`, e);
        }
        if (!diceBox.themesLoadedData?.[theme]?.diceAvailable)
            theme = "default";

        const landed = new Promise<void>((resolve) => (on_landed = resolve));
        try {
            diceBox.roll(notation, { ...options, theme });
        } catch (e) {
            // The dice after these must not wait forever
            console.error("Throwing dice failed", e);
            on_landed = null;
            return;
        }
        return landed;
    }

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
            const landed = on_landed;
            on_landed = null;
            // Somebody else's roll, its result came with the message
            if (shown_roll !== null || trying || !landed) {
                landed?.();
                return;
            }

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
            landed();
        };

        diceBox.init();
    });

    /** Ends the replay on screen early, a player's own roll doesn't wait for it */
    let interrupt_replay: (() => void) | null = null;

    roller.value = (new_rolls: string[], new_bonus: number) => {
        interrupt_replay?.();
        return enqueue(async (): Promise<RollOutcome> => {
            // Advantage and disadvantage need exactly one d20, which uses them up
            const d20_index = new_rolls.findIndex(
                (notation) => notation === "1d20" || notation === "d20",
            );
            const new_mode =
                d20_index === -1 ||
                new_rolls.some(
                    (notation, i) =>
                        i !== d20_index && notation.endsWith("d20"),
                )
                    ? "normal"
                    : rollState.mode;
            if (new_mode !== "normal") rollState.mode = "normal";
            const thrown =
                new_mode === "normal"
                    ? new_rolls
                    : new_rolls.map((notation, i) =>
                          i === d20_index ? "2d20" : notation,
                      );

            shown_roll = null;
            diceBox.clear();
            rolls = new_rolls;
            bonus = new_bonus;
            mode = new_mode;
            d20s = [];
            const roll_id = crypto.randomUUID();
            own_rolls.add(roll_id);

            const look = dice_look();
            const recording = await start_recording();
            await throw_dice(thrown, look);
            const replay = recording
                ? await finish_recording({ notation: thrown, ...look })
                : null;
            return {
                dice_values: dice_values,
                roll_result: roll_result,
                single_roll: single_roll,
                mode: mode,
                d20s: [...d20s],
                roll_id: roll_id,
                replay: replay,
            };
        });
    };

    /** Throws a d20 in the chosen look, only for this player to see */
    roller.try_look = () => {
        interrupt_replay?.();
        return enqueue(async () => {
            trying = true;
            shown_roll = null;
            diceBox.clear();
            await Promise.race([
                throw_dice(["1d20"], dice_look()),
                sleep(10000),
            ]);
            await sleep(1500);
            trying = false;
            diceBox.clear();
        });
    };

    /** Shows somebody else's roll with the same dice moving the same way */
    roller.replay = (roll: AnyRoll) => {
        const replay: DiceReplay | null | undefined = roll.replay;
        if (
            !replay ||
            !diceBox ||
            !dice_sync_available ||
            (roll.roll_id && own_rolls.has(roll.roll_id))
        ) {
            return Promise.resolve();
        }
        return enqueue(async () => {
            const interrupted = new Promise<void>(
                (resolve) => (interrupt_replay = resolve),
            );
            await Promise.race([modal_closes(3000), interrupted]);
            diceBox.clear();
            if (!(await start_replay(replay))) return;

            shown_roll = {
                roll,
                color: replay.themeColor ?? "#aa55aa",
                landed: false,
            };
            // If something goes wrong, the dice don't block everything after them
            await Promise.race([
                throw_dice(replay.notation, {
                    theme: replay.theme,
                    themeColor: replay.themeColor,
                }),
                sleep(replay_duration(replay) + 5000),
                interrupted,
            ]);
            stop_replay();
            shown_roll.landed = true;
            await Promise.race([sleep(2500), interrupted]);
            interrupt_replay = null;
            shown_roll = null;
            diceBox.clear();
        });
    };

    let bonus_string = $derived(format_bonus(roll_result, bonus));
</script>

<!-- The same shape on every screen: the dice box has to be the same everywhere for others' dice to land where they did -->
<div
    id="diceroller"
    class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-video w-[min(100vw,calc(100vh*16/9))] z-10 pointer-events-none overflow-hidden"
></div>
{#if shown_roll}
    {@const roll = shown_roll.roll}
    {@const natural = natural_d20(roll)}
    <div
        class="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
        transition:fly={{ y: 20, duration: 200 }}
    >
        <div
            class="frosted rounded-box shadow-lg flex flex-row items-center gap-4 pl-3 pr-4 py-2"
        >
            <div class="flex flex-col leading-tight min-w-24">
                <span class="font-bold flex flex-row items-center gap-1.5">
                    <span
                        class="w-2.5 h-2.5 rounded-full shrink-0"
                        style="background: {shown_roll.color}"
                    ></span>
                    {roll.sender}
                </span>
                <span class="text-xs text-base-content/70"
                    >{roll_title(roll)}{roll.mode && roll.mode !== "normal"
                        ? ` · ${mode_label(roll.mode)}`
                        : ""}</span
                >
            </div>
            <div class="min-w-12 flex flex-col items-center leading-none">
                {#if shown_roll.landed}
                    <span
                        class="text-3xl font-bold tabular-nums {natural === 20
                            ? 'text-success'
                            : natural === 1
                              ? 'text-error'
                              : ''}"
                        in:scale={{ start: 0.5, duration: 250 }}
                        >{roll_total(roll)}</span
                    >
                    {#if roll_detail(roll)}
                        <span
                            class="text-[0.65rem] text-base-content/60 tabular-nums mt-1"
                            >{roll_detail(roll)}</span
                        >
                    {/if}
                {:else}
                    <span class="loading loading-dots loading-md"></span>
                {/if}
            </div>
        </div>
    </div>
{/if}
<dialog
    bind:this={modal}
    onclose={() => {
        diceBox.clear();
        modal_closed?.();
        modal_closed = null;
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
