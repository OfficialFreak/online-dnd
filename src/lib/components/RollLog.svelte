<script lang="ts">
    import { gameState } from "$lib/state.svelte";
    import { MessageType } from "$lib/types/messaging/server_messages";
    import {
        kept_d20_index,
        mode_label,
        stat_label,
        type RollEntry,
    } from "$lib/rolls";

    let rolls = $derived(gameState.rolls.toReversed());

    function title(roll: RollEntry) {
        if (roll.type === MessageType.ROLL_RESULT) {
            return roll.notation || (roll.single_dice ? "Wurf" : "Würfel");
        }
        if (roll.stat === "initiative") return "Initiative";
        return `${stat_label(roll.stat)}-${roll.type === MessageType.SAVE_RESULT ? "Rettungswurf" : "Check"}`;
    }

    function total(roll: RollEntry) {
        return roll.type === MessageType.ROLL_RESULT
            ? roll.result
            : roll.result + roll.bonus;
    }

    /** How the total came together, empty if it is a single die */
    function detail(roll: RollEntry) {
        if (roll.type === MessageType.ROLL_RESULT) {
            return roll.single_dice ? "" : roll.dices;
        }
        if (roll.bonus === 0) return "";
        return `${roll.result} ${roll.bonus > 0 ? "+" : "−"} ${Math.abs(roll.bonus)}`;
    }

    /** The d20 of a roll with only a d20, to highlight natural 20s and 1s */
    function natural_d20(roll: RollEntry) {
        if (roll.type !== MessageType.ROLL_RESULT) return roll.result;
        return roll.notation === "1d20" ? roll.result : null;
    }

    function time(roll: RollEntry) {
        return roll.time
            ? new Date(roll.time).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : "";
    }
</script>

<div class="p-2 px-4 flex flex-col gap-2 min-h-full">
    <h1 class="text-3xl font-bold">Verlauf</h1>
    <ul class="flex flex-col gap-1">
        {#each rolls as roll}
            {@const natural = natural_d20(roll)}
            <li
                class="flex flex-row items-center gap-2 p-2 rounded-box bg-base-content/5"
            >
                <div class="flex-1 min-w-0">
                    <div class="text-sm truncate">
                        <span class="font-bold">{roll.sender}</span
                        >{roll.sender_dm ? " 👑" : ""} · {title(roll)}
                    </div>
                    <div
                        class="text-xs text-base-content/60 flex flex-row flex-wrap items-center gap-x-1"
                    >
                        <span>{time(roll)}</span>
                        {#if detail(roll)}
                            <span>· {detail(roll)}</span>
                        {/if}
                        {#if mode_label(roll.mode)}
                            <span
                                class={roll.mode === "advantage"
                                    ? "text-success"
                                    : "text-error"}
                            >
                                · {mode_label(roll.mode)}
                                {#if roll.d20s?.length === 2}
                                    {@const kept = kept_d20_index(
                                        roll.mode,
                                        roll.d20s,
                                    )}
                                    ({#each roll.d20s as value, i}{#if i > 0}<span class="mx-0.5"
                                            >|</span
                                        >{/if}<span
                                            class={i === kept
                                                ? "font-bold"
                                                : "line-through opacity-60"}
                                            >{value}</span
                                        >{/each})
                                {/if}
                            </span>
                        {/if}
                        {#if roll.type === MessageType.ROLL_RESULT && roll.dm_only}
                            <span class="badge badge-xs badge-info">Nur DM</span
                            >
                        {/if}
                        {#if roll.private}
                            <span class="badge badge-xs">Privat</span>
                        {/if}
                    </div>
                </div>
                <span
                    class="text-2xl font-bold tabular-nums {natural === 20
                        ? 'text-success'
                        : natural === 1
                          ? 'text-error'
                          : ''}">{total(roll)}</span
                >
            </li>
        {:else}
            <li class="text-center text-base-content/60 py-4">
                Noch wurde nichts gewürfelt
            </li>
        {/each}
    </ul>
</div>
