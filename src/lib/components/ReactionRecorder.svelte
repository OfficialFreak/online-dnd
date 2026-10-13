<script lang="ts">
    import { appState } from "$lib/state.svelte";
    import {
        REACTIONS,
        reactionState,
        play_reaction,
        VOICELINE,
        type ReactionKey,
    } from "$lib/reactions.svelte";
    import { record } from "$lib/sfx";
    import { upload_bytes } from "$lib/upload.svelte";
    import {
        DeleteVoiceline,
        GetReactions,
        SetReaction,
        SetVoiceline,
    } from "$lib/types/messaging/client_messages";
    import type { Voiceline } from "$lib/types/messaging/server_messages";
    import { MessageTypes, notify } from "$lib/notifications.svelte";

    /**
     * What is being recorded or saved: a reaction's key, or "line:" and the id of a line
     * of the player's own, "line:new" for a new one
     */
    let recording: string | null = $state(null);
    let saving: string | null = $state(null);
    let stop: (() => Promise<Uint8Array | null>) | null = null;
    /** The name of a new line */
    let new_line = $state("");

    $effect(() => {
        appState.ws?.send(GetReactions.create());
    });

    /**
     * Records up to `seconds` and uploads it, the name of the recording on the server. A
     * second press while recording stops it, that one gives nothing.
     */
    async function capture(key: string, seconds: number): Promise<string | null> {
        if (recording === key && stop) {
            await stop();
            return null;
        }
        if (recording || saving) return null;
        let wav: Uint8Array | null;
        try {
            const recorder = await record(seconds);
            recording = key;
            stop = recorder.stop;
            wav = await recorder.result;
        } catch (e: any) {
            console.error("Recording failed", e);
            notify(
                e?.name === "NotAllowedError"
                    ? "Kein Zugriff aufs Mikrofon, erlaube es in den Einstellungen der Website"
                    : e?.name === "NotFoundError"
                      ? "Kein Mikrofon gefunden"
                      : "Aufnehmen ging nicht",
                MessageTypes.Error,
                5000,
            );
            return null;
        } finally {
            recording = null;
            stop = null;
        }
        if (!wav) {
            notify("Nichts gehört, sprich etwas lauter", MessageTypes.Info, 3000);
            return null;
        }
        saving = key;
        try {
            // A new name each time, so nobody hears the old recording from their cache
            return await upload_bytes(
                wav,
                `reaction-${key.replace(/[^a-z0-9]+/gi, "-")}-${Date.now().toString(36)}.wav`,
            );
        } finally {
            saving = null;
        }
    }

    async function toggle(key: ReactionKey) {
        const asset = await capture(key, 3);
        if (!asset) return;
        appState.ws?.send(SetReaction.create(key, asset));
        play_reaction(key, asset);
    }

    /** A line of the player's own: a new one with the typed name, or one recorded anew */
    async function record_line(line: Voiceline | null) {
        const key = `line:${line?.id ?? "new"}`;
        const name = line?.name ?? new_line.trim();
        if (!name && recording !== key) {
            notify("Gib dem Spruch zuerst einen Namen", MessageTypes.Info, 3000);
            return;
        }
        const asset = await capture(key, 8);
        if (!asset) return;
        appState.ws?.send(SetVoiceline.create(line?.id ?? null, name, asset));
        if (!line) new_line = "";
        play_reaction(VOICELINE, asset, "", name);
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

<div class="divider my-2 text-xs text-base-content/60">Eigene Sprüche, bis zu 8 Sekunden</div>
<div class="flex flex-col gap-1">
    {#each reactionState.voicelines as line (line.id)}
        {@const key = `line:${line.id}`}
        <div class="flex items-center gap-2">
            <span class="w-44 text-sm truncate" title={line.name}
                ><span class="text-lg">🗣️</span> {line.name}</span
            >
            <button
                class="btn btn-sm {recording === key ? 'btn-error' : ''}"
                disabled={(recording !== null && recording !== key) || saving !== null}
                onclick={() => record_line(line)}
            >
                {#if recording === key}
                    <i class="fa-solid fa-stop"></i> Stopp
                {:else if saving === key}
                    <span class="loading loading-spinner loading-xs"></span>
                {:else}
                    <i class="fa-solid fa-microphone"></i> Neu aufnehmen
                {/if}
            </button>
            <button
                class="btn btn-sm btn-ghost btn-square"
                aria-label="Anhören"
                title="Anhören, nur bei dir"
                onclick={() => play_reaction(VOICELINE + line.id, line.file, "", line.name)}
            >
                <i class="fa-solid fa-play"></i>
            </button>
            <button
                class="btn btn-sm btn-ghost btn-square"
                aria-label="Spruch löschen"
                title="Löschen"
                onclick={() => appState.ws?.send(DeleteVoiceline.create(line.id))}
            >
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    {/each}
    <form
        class="flex items-center gap-2"
        onsubmit={(event) => {
            event.preventDefault();
            record_line(null);
        }}
    >
        <input
            class="input input-sm w-44"
            placeholder="Name, z. B. Für Ruhm!"
            maxlength="40"
            aria-label="Name des neuen Spruchs"
            bind:value={new_line}
        />
        <button
            class="btn btn-sm {recording === 'line:new' ? 'btn-error' : ''}"
            disabled={(recording !== null && recording !== "line:new") ||
                saving !== null ||
                (!new_line.trim() && recording !== "line:new")}
        >
            {#if recording === "line:new"}
                <i class="fa-solid fa-stop"></i> Stopp
            {:else if saving === "line:new"}
                <span class="loading loading-spinner loading-xs"></span>
            {:else}
                <i class="fa-solid fa-microphone"></i> Aufnehmen
            {/if}
        </button>
    </form>
</div>

