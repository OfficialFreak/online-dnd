<script lang="ts">
    import { gameState } from "$lib/state.svelte";
    import { MessageType } from "$lib/types/messaging/server_messages";
    import {
        kept_d20_index,
        mode_label,
        natural_d20,
        roll_detail,
        roll_title,
        roll_total,
        type RollEntry,
    } from "$lib/rolls";

    let rolls = $derived(gameState.rolls.toReversed());

    function time(roll: RollEntry) {
        return roll.time
            ? new Date(roll.time).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : "";
    }

    function icon(roll: RollEntry) {
        if (roll.type === MessageType.SAVE_RESULT) return "fa-shield-halved";
        if (roll.type === MessageType.CHECK_RESULT) {
            return roll.stat === "initiative" ? "fa-bolt" : "fa-dice-d20";
        }
        return natural_d20(roll) !== null ? "fa-dice-d20" : "fa-dice";
    }
</script>

<div class="p-2 px-4 flex flex-col gap-2 min-h-full">
    <h1 class="text-3xl font-bold">Verlauf</h1>
    <ul class="flex flex-col gap-1">
        {#each rolls as roll}
            {@const natural = natural_d20(roll)}
            {@const detail = roll_detail(roll)}
            <li
                class="relative flex flex-row items-center gap-3 p-2 pl-3 rounded-box bg-base-content/5 overflow-hidden"
            >
                {#if natural === 20 || natural === 1}
                    <span
                        class="absolute left-0 inset-y-0 w-1 {natural === 20
                            ? 'bg-success'
                            : 'bg-error'}"
                    ></span>
                {/if}
                <span
                    class="w-8 h-8 shrink-0 rounded-full bg-base-content/10 flex items-center justify-center text-base-content/70"
                >
                    <i class="fa-solid {icon(roll)}"></i>
                </span>
                <div class="flex-1 min-w-0 leading-tight">
                    <div class="text-sm truncate">
                        <span class="font-bold">{roll.sender}</span
                        >{roll.sender_dm ? " 👑" : ""}
                    </div>
                    <div class="text-xs text-base-content/70 truncate">
                        {roll_title(roll)}
                    </div>
                    <div
                        class="text-xs text-base-content/50 flex flex-row flex-wrap items-center gap-x-1.5 mt-0.5"
                    >
                        {#if time(roll)}<span>{time(roll)}</span>{/if}
                        {#if detail}<span class="tabular-nums">{detail}</span
                            >{/if}
                        {#if mode_label(roll.mode)}
                            <span
                                class="badge badge-xs {roll.mode === 'advantage'
                                    ? 'badge-success'
                                    : 'badge-error'} badge-soft gap-1"
                            >
                                {mode_label(roll.mode)}
                                {#if roll.d20s?.length === 2}
                                    {@const kept = kept_d20_index(
                                        roll.mode,
                                        roll.d20s,
                                    )}
                                    {#each roll.d20s as value, i}<span
                                            class={i === kept
                                                ? "font-bold"
                                                : "line-through opacity-50"}
                                            >{value}</span
                                        >{/each}
                                {/if}
                            </span>
                        {/if}
                        {#if roll.type === MessageType.ROLL_RESULT && roll.dm_only}
                            <span class="badge badge-xs badge-info badge-soft"
                                >Nur DM</span
                            >
                        {/if}
                        {#if roll.private}
                            <span class="badge badge-xs badge-soft">Privat</span
                            >
                        {/if}
                    </div>
                </div>
                <span
                    class="text-2xl font-bold tabular-nums {natural === 20
                        ? 'text-success'
                        : natural === 1
                          ? 'text-error'
                          : ''}">{roll_total(roll)}</span
                >
            </li>
        {:else}
            <li
                class="flex flex-col items-center gap-2 text-base-content/50 py-8"
            >
                <i class="fa-solid fa-dice-d20 text-3xl"></i>
                Noch wurde nichts gewürfelt
            </li>
        {/each}
    </ul>
</div>
