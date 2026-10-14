<script lang="ts">
    import { fly } from "svelte/transition";
    import {
        REACTIONS,
        reactionState,
        send_reaction,
        VOICELINE,
    } from "$lib/reactions.svelte";
    import ReactionRecorder from "./ReactionRecorder.svelte";

    /**
     * The button for quick reactions, in the row of the dice so it moves aside when they
     * grow. And what was just called out.
     */
    let open = $state(false);
    let bar: HTMLElement | undefined = $state();
    let recorder: HTMLDialogElement | undefined = $state();
    let recording = $state(false);

    function on_pointer_down(event: PointerEvent) {
        if (open && bar && !bar.contains(event.target as Node)) open = false;
    }
</script>

<svelte:window onpointerdowncapture={on_pointer_down} />

<!-- The menu opens above the button: beside it, many lines of one's own wrapped into a
     block that pushed the dice aside -->
<div class="relative flex items-end" bind:this={bar}>
    <button
        class="btn btn-circle w-12 h-12 shadow {open ? 'btn-info' : ''}"
        aria-label="Reaktionen"
        aria-expanded={open}
        title="Reaktionen"
        onclick={() => (open = !open)}
    >
        <i class="fa-solid fa-face-grin-squint text-xl"></i>
    </button>
    {#if open}
        <div
            class="absolute bottom-full left-0 mb-2 w-max min-w-60 max-w-[min(22rem,calc(100vw-4.5rem-var(--safe-left)-var(--safe-right)))] frosted rounded-box shadow-lg p-2 flex flex-col gap-1"
            transition:fly={{ y: 8, duration: 150 }}
        >
            <div class="grid grid-cols-4 gap-1">
                {#each REACTIONS as reaction (reaction.key)}
                    <button
                        class="btn btn-ghost h-auto min-h-0 py-1.5 px-1 flex-col gap-0.5 font-normal"
                        onclick={() => send_reaction(reaction.key)}
                    >
                        <span class="text-2xl leading-none">{reaction.emoji}</span>
                        <span class="text-xs">{reaction.label}</span>
                    </button>
                {/each}
            </div>
            {#if reactionState.voicelines.length}
                <div class="border-t border-base-content/10 pt-1 flex flex-col max-h-48 overflow-y-auto">
                    {#each reactionState.voicelines as line (line.id)}
                        <button
                            class="btn btn-ghost btn-sm justify-start font-normal gap-2"
                            title={line.name}
                            onclick={() => send_reaction(VOICELINE + line.id)}
                        >
                            <span class="text-base leading-none">🗣️</span>
                            <span class="truncate">{line.name}</span>
                        </button>
                    {/each}
                </div>
            {/if}
            <button
                class="btn btn-ghost btn-xs self-end font-normal text-base-content/60"
                title="Mit deiner eigenen Stimme einsprechen, auch eigene Sprüche"
                onclick={() => {
                    open = false;
                    recording = true;
                    recorder?.showModal();
                }}
            >
                <i class="fa-solid fa-microphone"></i> Einsprechen
            </button>
        </div>
    {/if}
</div>

<dialog
    bind:this={recorder}
    class="modal"
    onclose={() => (recording = false)}
>
    <div class="modal-box w-fit max-w-[calc(100vw-2rem)]">
        <h3 class="text-lg font-bold mb-3">Reaktionen einsprechen</h3>
        {#if recording}
            <ReactionRecorder />
        {/if}
        <div class="modal-action">
            <form method="dialog"><button class="btn">Fertig</button></form>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>

<!-- Above the dice, the newest at the bottom -->
<div
    class="fixed bottom-[calc(var(--corner-bottom)+4rem)] left-[var(--corner-left)] z-[1000] flex flex-col gap-1 pointer-events-none"
    aria-live="polite"
>
    {#each reactionState.bubbles as bubble (bubble.id)}
        <div
            class="flex items-center gap-2 bg-base-100/90 rounded-full shadow pl-1 pr-3 py-1 w-fit"
            in:fly={{ x: -24, duration: 200 }}
            out:fly={{ y: -16, duration: 400 }}
        >
            <span class="text-2xl leading-none">{bubble.emoji}</span>
            <span class="text-sm">
                {#if bubble.who}<b>{bubble.who}:</b>{/if}
                {bubble.text}
            </span>
        </div>
    {/each}
</div>
