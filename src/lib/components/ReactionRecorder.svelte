<script lang="ts">
    import { appState } from "$lib/state.svelte";
    import {
        REACTIONS,
        reactionState,
        play_reaction,
        type ReactionKey,
    } from "$lib/reactions.svelte";
    import { record } from "$lib/sfx";
    import { upload_bytes } from "$lib/upload.svelte";
    import { GetReactions, SetReaction } from "$lib/types/messaging/client_messages";
    import { MessageTypes, notify } from "$lib/notifications.svelte";

    /** The reactions in the player's own voice, recorded here */
    let recording: ReactionKey | null = $state(null);
    let saving: ReactionKey | null = $state(null);
    let stop: (() => Promise<Uint8Array | null>) | null = null;

    $effect(() => {
        appState.ws?.send(GetReactions.create());
    });

    async function toggle(key: ReactionKey) {
        if (recording === key && stop) {
            await stop();
            return;
        }
        if (recording || saving) return;
        let wav: Uint8Array | null;
        try {
            const recorder = await record(3);
            recording = key;
            stop = recorder.stop;
            wav = await recorder.result;
        } catch (e) {
            console.error("Recording failed", e);
            notify("Kein Zugriff aufs Mikrofon", MessageTypes.Error, 4000);
            return;
        } finally {
            recording = null;
            stop = null;
        }
        if (!wav) {
            notify("Nichts gehört, sprich etwas lauter", MessageTypes.Info, 3000);
            return;
        }
        saving = key;
        const asset = await upload_bytes(wav, `reaction-${key}.wav`);
        saving = null;
        if (!asset) return;
        appState.ws?.send(SetReaction.create(key, asset));
        play_reaction(key, asset);
    }
</script>

<div class="flex flex-col gap-1">
    {#each REACTIONS as reaction (reaction.key)}
        {@const own = reactionState.mine[reaction.key]}
        <div class="flex items-center gap-2">
            <span class="w-28 text-sm"
                ><span class="text-lg">{reaction.emoji}</span> {reaction.label}</span
            >
            <button
                class="btn btn-sm {recording === reaction.key ? 'btn-error' : ''}"
                disabled={(recording !== null && recording !== reaction.key) ||
                    saving !== null}
                onclick={() => toggle(reaction.key)}
            >
                {#if recording === reaction.key}
                    <i class="fa-solid fa-stop"></i> Stopp
                {:else if saving === reaction.key}
                    <span class="loading loading-spinner loading-xs"></span>
                {:else}
                    <i class="fa-solid fa-microphone"></i>
                    {own ? "Neu aufnehmen" : "Aufnehmen"}
                {/if}
            </button>
            <button
                class="btn btn-sm btn-ghost btn-square"
                aria-label="Anhören"
                title="Anhören, nur bei dir"
                onclick={() => play_reaction(reaction.key, own)}
            >
                <i class="fa-solid fa-play"></i>
            </button>
            {#if own}
                <button
                    class="btn btn-sm btn-ghost btn-square"
                    aria-label="Eigene Aufnahme löschen"
                    title="Löschen, dann kommt wieder die Standardstimme"
                    onclick={() =>
                        appState.ws?.send(SetReaction.create(reaction.key, null))}
                >
                    <i class="fa-solid fa-trash"></i>
                </button>
            {:else}
                <span class="text-xs text-base-content/50">Standardstimme</span>
            {/if}
        </div>
    {/each}
</div>
