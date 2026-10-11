<script lang="ts">
    import { appState } from "$lib/state.svelte";
    import {
        audioState,
        guess_sound_kind,
        type Sound,
    } from "$lib/audio.svelte";
    import {
        DeleteSound,
        PlaySound,
        PutSound,
        StopMusic,
    } from "$lib/types/messaging/client_messages";
    import { file_stem_of, pick_file, upload_path } from "$lib/upload.svelte";
    import { uploadState } from "$lib/upload.svelte";

    let search = $state("");
    let confirm_delete: string | null = $state(null);
    let confirm_timeout: ReturnType<typeof setTimeout> | undefined;

    function sounds_of(kind: Sound["kind"]) {
        return audioState.sounds
            .filter((sound) => sound.kind === kind)
            .filter((sound) =>
                sound.name.toLowerCase().includes(search.trim().toLowerCase()),
            )
            .toSorted((a, b) => a.name.localeCompare(b.name));
    }

    let music = $derived(sounds_of("music"));
    let effects = $derived(sounds_of("effect"));

    async function add_sound() {
        const path = await pick_file("audio");
        if (path === null) return;
        const asset = await upload_path(path);
        if (!asset) return;
        appState.ws?.send(
            PutSound.create(
                file_stem_of(path),
                asset,
                await guess_sound_kind(asset),
            ),
        );
    }

    function switch_kind(sound: Sound) {
        appState.ws?.send(
            PutSound.create(
                sound.name,
                sound.file,
                sound.kind === "music" ? "effect" : "music",
            ),
        );
    }

    function request_delete(name: string) {
        if (confirm_delete === name) {
            confirm_delete = null;
            appState.ws?.send(DeleteSound.create(name));
            return;
        }
        confirm_delete = name;
        // An older timer would end this confirmation early
        clearTimeout(confirm_timeout);
        confirm_timeout = setTimeout(() => {
            if (confirm_delete === name) confirm_delete = null;
        }, 3000);
    }
</script>

{#snippet sound_row(sound: Sound)}
    {@const playing =
        sound.kind === "music" && audioState.music?.name === sound.name}
    <li
        class="group flex flex-row items-center gap-1 p-1 rounded-box hover:bg-base-content/10 {playing
            ? 'bg-info/15'
            : ''}"
    >
        <button
            class="btn btn-sm btn-square {playing ? 'btn-info' : 'btn-ghost'}"
            aria-label={playing ? "Stoppen" : "Für alle abspielen"}
            title={playing ? "Stoppen" : "Für alle abspielen"}
            onclick={() =>
                appState.ws?.send(
                    playing ? StopMusic.create() : PlaySound.create(sound.name),
                )}
        >
            <i
                class="fa-solid {playing
                    ? 'fa-stop'
                    : sound.kind === 'music'
                      ? 'fa-play'
                      : 'fa-bolt'}"
            ></i>
        </button>
        <span class="flex-1 truncate" title={sound.name}>{sound.name}</span>
        <button
            class="btn btn-xs btn-ghost opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            title={sound.kind === "music"
                ? "Zum Effekt machen, spielt einmal"
                : "Zur Musik machen, läuft in Schleife"}
            onclick={() => switch_kind(sound)}
        >
            <i
                class="fa-solid {sound.kind === 'music'
                    ? 'fa-bolt'
                    : 'fa-music'}"
            ></i>
        </button>
        <button
            class="btn btn-xs {confirm_delete === sound.name
                ? 'btn-error'
                : 'btn-ghost btn-square opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
            aria-label="Sound löschen"
            onclick={() => request_delete(sound.name)}
        >
            {#if confirm_delete === sound.name}
                Löschen?
            {:else}
                <i class="fa-solid fa-trash"></i>
            {/if}
        </button>
    </li>
{/snippet}

<div class="p-2 px-4 flex flex-col gap-2 min-h-full">
    <h1 class="text-3xl font-bold">Musik</h1>
    <p class="text-sm text-base-content/60">
        Musik läuft für alle in Schleife, Effekte spielen einmal. Audiodateien
        aus dem Explorer kannst du hier hineinziehen.
    </p>
    {#if audioState.music}
        <div
            class="flex flex-row items-center gap-2 p-2 rounded-box bg-info/15"
        >
            <span class="equalizer" aria-hidden="true"
                ><span></span><span></span><span></span><span></span></span
            >
            <span class="flex-1 min-w-0 leading-tight">
                <span class="block text-xs text-base-content/60">Läuft gerade</span>
                <span class="block truncate font-semibold"
                    >{audioState.music.name}</span
                >
            </span>
            <button
                class="btn btn-sm"
                onclick={() => appState.ws?.send(StopMusic.create())}
            >
                <i class="fa-solid fa-stop"></i> Stopp
            </button>
        </div>
    {/if}
    <label class="input input-sm w-full">
        <i class="fa-solid fa-magnifying-glass opacity-50"></i>
        <input type="search" placeholder="Suchen" bind:value={search} />
    </label>
    <h2 class="font-bold">Musik</h2>
    <ul class="flex flex-col gap-0.5">
        {#each music as sound (sound.name)}
            {@render sound_row(sound)}
        {:else}
            <li class="text-sm text-base-content/60">Noch keine Musik</li>
        {/each}
    </ul>
    <h2 class="font-bold">Effekte</h2>
    <ul class="flex flex-col gap-0.5">
        {#each effects as sound (sound.name)}
            {@render sound_row(sound)}
        {:else}
            <li class="text-sm text-base-content/60">Noch keine Effekte</li>
        {/each}
    </ul>
    <button class="btn" disabled={uploadState.uploading} onclick={add_sound}>
        {#if uploadState.uploading}
            <span class="loading loading-spinner"></span>
            Wird hochgeladen…
        {:else}
            Audio hinzufügen
        {/if}
    </button>
</div>

<style>
    /* Bars that bounce while music plays */
    .equalizer {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 1.1rem;
        color: var(--color-info);
    }

    .equalizer span {
        width: 3px;
        height: 100%;
        border-radius: 1px;
        background: currentColor;
        transform-origin: bottom;
        animation: bounce 0.9s ease-in-out infinite alternate;
    }

    .equalizer span:nth-child(2) {
        animation-delay: -0.3s;
    }

    .equalizer span:nth-child(3) {
        animation-delay: -0.6s;
    }

    .equalizer span:nth-child(4) {
        animation-delay: -0.15s;
    }

    @keyframes bounce {
        from {
            scale: 1 0.25;
        }
        to {
            scale: 1 1;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .equalizer span {
            animation: none;
        }
    }
</style>
