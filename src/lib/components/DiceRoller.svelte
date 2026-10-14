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
    import { emoji_cannon } from "$lib/emoji-burst";
    import { gameState, roller, rollState } from "../state.svelte";
    import { dice_look } from "../dice-skins.svelte";
    import {
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

    let confetti_canvas: HTMLCanvasElement | null = $state(null);
    // Its own canvas, canvas-confetti clears the whole of its canvas on every frame
    let emoji_canvas: HTMLCanvasElement | null = $state(null);
    let diceBox: DiceBox | null = $state(null);
    let dice_values: string = $state("");
    let roll_result: number = $state(-1);
    let rolls: string[] = $state([]);
    let bonus: number = $state(0);
    let mode = $state<RollMode>("normal");
    /** Both d20s of a roll with advantage or disadvantage, the first one counts with advantage */
    let d20s: number[] = $state([]);
    let single_roll = $derived(
        rolls.length === 1 && rolls[0].substring(0, 2) === "1d",
    );

    /**
     * The roll being shown at the bottom, one's own or somebody else's, with who rolled it
     * and, once the dice landed, what came out
     */
    let shown_roll: {
        roll: AnyRoll;
        /** The color of the roller's dice */
        color: string;
        landed: boolean;
        /** The d20 of a roll of one d20, without the bonus, for 20s and 1s */
        natural?: number | null;
    } | null = $state(null);
    /** The id of the own roll being thrown, its card takes the server's title later */
    let own_roll_id: string | null = null;
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

    /** How long one's own result stays at the bottom */
    const OWN_CARD_MS = 3500;
    /** Until when it stays, somebody else's dice wait for it */
    let own_card_until = 0;
    let own_card_timer: ReturnType<typeof setTimeout> | undefined;

    /** Gives the player a moment to read their own result before other dice come */
    function own_card_done(max_ms: number) {
        return sleep(Math.min(max_ms, Math.max(0, own_card_until - Date.now())));
    }

    /**
     * Shows one's own roll at the bottom like everyone else's, instead of a dialog in the
     * middle. The server's copy of it, with what was checked, takes its place once there.
     */
    function show_own_roll() {
        const one_d20 = rolls.length === 1 && (rolls[0] === "1d20" || rolls[0] === "d20");
        const with_bonus = bonus === 0 ? "" : ` ${bonus > 0 ? "+" : "−"} ${Math.abs(bonus)}`;
        const roll = {
            type: MessageType.ROLL_RESULT,
            sender: gameState.name,
            sender_dm: gameState.dm,
            notation: rolls.join(" + "),
            single_dice: single_roll && bonus === 0,
            dices: `${dice_values}${with_bonus}`,
            result: roll_result + bonus,
            mode,
            d20s: [...d20s],
            dm_only: false,
            roll_id: own_roll_id,
        } as AnyRoll;
        const look = dice_look();
        const shown = {
            roll,
            color: look.themeColor ?? "#aa55aa",
            landed: true,
            natural: one_d20 ? roll_result : null,
        };
        shown_roll = shown;
        own_card_until = Date.now() + OWN_CARD_MS;
        clearTimeout(own_card_timer);
        own_card_timer = setTimeout(() => {
            if (shown_roll?.roll.roll_id !== roll.roll_id) return;
            shown_roll = null;
            diceBox?.clear();
        }, OWN_CARD_MS);
    }

    /** Counts the throws, so one that was given up while loading its theme stays given up */
    let throws = 0;

    /** Throws the dice and waits until they all landed */
    async function throw_dice(
        notation: string[],
        options: { theme?: string; themeColor?: string } = {},
    ) {
        const this_throw = ++throws;
        // dice-box only throws dice in themes it loaded before
        let theme = options.theme ?? "default";
        try {
            await diceBox.loadTheme(theme);
        } catch (e) {
            console.error(`Loading the dice theme ${theme} failed`, e);
        }
        // An interrupted replay would otherwise clear the dice of the roll after it
        // and take over the wait for them
        if (this_throw !== throws) return;
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
            assetPath: "/dice/",
            themeColor: "#aa55aa",
            scale: 5,
        });
        let confetti_function = confetti.create(confetti_canvas, {
            resize: true,
        });
        const poop_burst = emoji_canvas ? emoji_cannon(emoji_canvas) : null;
        diceBox.onRollComplete = (results: any) => {
            const landed = on_landed;
            on_landed = null;
            // Somebody else's roll, its result came with the message
            if ((shown_roll !== null && !own_roll_id) || !landed) {
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

            // Celebration, from the result at the bottom
            if (
                single_roll &&
                (rolls[0] === "1d20" || rolls[0] === "d20") &&
                roll_result === 20
            ) {
                confetti_function({
                    particleCount: 120,
                    spread: 70,
                    origin: { x: 0.5, y: 1 },
                });
            }
            // Added physcological damage
            if (
                single_roll &&
                (rolls[0] === "1d20" || rolls[0] === "d20") &&
                roll_result === 1
            ) {
                poop_burst?.({
                    emojis: ["💩"],
                    count: 100,
                    spread: 70,
                    size: 40,
                    origin: { x: 0.5, y: 1.05 },
                });
            }
            show_own_roll();
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
            clearTimeout(own_card_timer);
            own_card_until = 0;
            diceBox.clear();
            rolls = new_rolls;
            bonus = new_bonus;
            mode = new_mode;
            d20s = [];
            const roll_id = crypto.randomUUID();
            own_rolls.add(roll_id);
            own_roll_id = roll_id;

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

    /**
     * Shows somebody else's roll with the same dice moving the same way, or only its result
     * where the dice can't be shown. One's own takes the server's title, e.g. the check.
     */
    roller.replay = (roll: AnyRoll) => {
        if (roll.roll_id && own_rolls.has(roll.roll_id)) {
            if (shown_roll && shown_roll.roll.roll_id === roll.roll_id) {
                shown_roll.roll = roll;
            }
            return Promise.resolve();
        }
        const replay: DiceReplay | null | undefined = roll.replay;
        return enqueue(async () => {
            const interrupted = new Promise<void>(
                (resolve) => (interrupt_replay = resolve),
            );
            await Promise.race([own_card_done(3000), interrupted]);
            own_roll_id = null;
            diceBox?.clear();
            const with_dice =
                !!replay && !!diceBox && dice_sync_available && (await start_replay(replay));

            shown_roll = {
                roll,
                color: replay?.themeColor ?? "#aa55aa",
                landed: !with_dice,
            };
            if (with_dice && replay) {
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
            }
            await Promise.race([sleep(with_dice ? 2500 : 3500), interrupted]);
            interrupt_replay = null;
            shown_roll = null;
            diceBox?.clear();
        });
    };

</script>

<!-- The same shape on every screen: the dice box has to be the same everywhere for others' dice to land where they did -->
<div
    id="diceroller"
    class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-video w-[min(100vw,calc(100vh*16/9))] z-10 pointer-events-none overflow-hidden"
></div>
{#if shown_roll}
    {@const roll = shown_roll.roll}
    {@const natural = shown_roll.natural ?? natural_d20(roll)}
    <div
        class="fixed bottom-[calc(5rem+var(--safe-bottom))] left-1/2 -translate-x-1/2 z-10 pointer-events-none"
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
                    {#if roll.mode && roll.mode !== "normal" && roll.d20s?.length === 2}
                        <span class="text-[0.65rem] text-base-content/60 tabular-nums mt-0.5">
                            {roll.d20s[0]} | {roll.d20s[1]}
                        </span>
                    {/if}
                {:else}
                    <span class="loading loading-dots loading-md"></span>
                {/if}
            </div>
        </div>
    </div>
{/if}
<!-- Over everything, from the result at the bottom -->
<canvas
    bind:this={confetti_canvas}
    class="fixed inset-0 w-full h-full pointer-events-none z-[1001]"
    aria-hidden="true"
></canvas>
<canvas
    bind:this={emoji_canvas}
    class="fixed inset-0 w-full h-full pointer-events-none z-[1001]"
    aria-hidden="true"
></canvas>

<style>
    :global(.dice-box-canvas) {
        width: 100% !important;
        height: 100% !important;
    }
</style>
