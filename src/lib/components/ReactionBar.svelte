<script lang="ts">
    import { fly } from "svelte/transition";
    import { REACTIONS, reactionState, send_reaction } from "$lib/reactions.svelte";

    /**
     * The button for quick reactions, in the row of the dice so it moves aside when they
     * grow. And what was just called out.
     */
    let open = $state(false);
    let bar: HTMLElement | undefined = $state();

    function on_pointer_down(event: PointerEvent) {
        if (open && bar && !bar.contains(event.target as Node)) open = false;
    }
</script>

<svelte:window onpointerdowncapture={on_pointer_down} />

<div class="flex items-end gap-1" bind:this={bar}>
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
            class="flex flex-wrap gap-1 bg-base-100 rounded-box p-1 shadow max-w-[calc(100vw-7.5rem)]"
            transition:fly={{ x: -12, duration: 150 }}
        >
            {#each REACTIONS as reaction (reaction.key)}
                <button
                    class="btn btn-sm"
                    onclick={() => send_reaction(reaction.key)}
                >
                    <span class="text-lg leading-none">{reaction.emoji}</span>
                    {reaction.label}
                </button>
            {/each}
        </div>
    {/if}
</div>

<!-- Above the dice, the newest at the bottom -->
<div
    class="fixed bottom-[calc(4.5rem+var(--safe-bottom))] left-[calc(0.5rem+var(--safe-left))] z-[1000] flex flex-col gap-1 pointer-events-none"
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
