<script lang="ts">
    import { appState } from "$lib/state.svelte";
    import { in_tauri } from "$lib/platform";
    import {
        audioState,
        guess_sound_kind,
        set_sound_level,
        type Playing,
        type Sound,
    } from "$lib/audio.svelte";
    import {
        DeleteSound,
        PlaySound,
        PutSound,
        SetSoundLevel,
        StopMusic,
        StopSound,
    } from "$lib/types/messaging/client_messages";
    import { file_stem_of, pick_file, upload_picked } from "$lib/upload.svelte";
    import { uploadState } from "$lib/upload.svelte";
    import SoundLibrary from "./SoundLibrary.svelte";
    import WeatherControls from "./WeatherControls.svelte";

    /** The DM's own sounds or the libraries to find new ones in */
    let view: "own" | "library" = $state("own");

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
    let ambience = $derived(sounds_of("ambience"));
    let effects = $derived(sounds_of("effect"));

    function is_playing(name: string) {
        return (
            audioState.music?.name === name ||
            audioState.ambience.some((playing) => playing.name === name) ||
            audioState.effects.includes(name)
        );
    }

    /** What the kind button turns a sound into, in turn */
    const NEXT_KIND: Record<Sound["kind"], Sound["kind"]> = {
        music: "ambience",
        ambience: "effect",
        effect: "music",
    };
    const KIND_ICON: Record<Sound["kind"], string> = {
        music: "fa-music",
        ambience: "fa-cloud-rain",
        effect: "fa-bolt",
    };
    const BECOME: Record<Sound["kind"], string> = {
        music: "Zur Musik machen, läuft in Schleife, ein neues Lied ersetzt sie",
        ambience: "Zum Ambiente machen, läuft neben der Musik in Schleife",
        effect: "Zum Effekt machen, spielt einmal",
    };

    /**
     * The level slider stands at the square root, as the ear hears: its lower half covers
     * the quiet levels finely
     */
    let level_timers = new Map<string, ReturnType<typeof setTimeout>>();
    function change_level(name: string, slider: number, done = false) {
        const level = slider * slider;
        set_sound_level(name, level);
        // Dragging sends a few times a second, letting go at once
        clearTimeout(level_timers.get(name));
        level_timers.set(
            name,
            setTimeout(
                () => appState.ws?.send(SetSoundLevel.create(name, level)),
                done ? 0 : 150,
            ),
        );
    }

    async function add_sound() {
        const picked = await pick_file("audio");
        if (picked === null) return;
        const asset = await upload_picked(picked);
        if (!asset) return;
        appState.ws?.send(
            PutSound.create(
                file_stem_of(typeof picked === "string" ? picked : picked.name),
                asset,
                await guess_sound_kind(asset),
            ),
        );
    }

    /** Music and ambience stop for everyone, effects that are still playing too */
    function stop(name: string) {
        if (audioState.music?.name === name) {
            appState.ws?.send(StopMusic.create());
        }
        if (
            audioState.ambience.some((playing) => playing.name === name) ||
            audioState.effects.includes(name)
        ) {
            appState.ws?.send(StopSound.create(name));
        }
    }

    function switch_kind(sound: Sound) {
        // It would keep playing the old way, an effect without a way to stop it
        stop(sound.name);
        appState.ws?.send(PutSound.create(sound.name, sound.file, NEXT_KIND[sound.kind]));
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
    {@const playing = is_playing(sound.name)}
    <li
        class="group flex flex-row items-center gap-1 p-1 rounded-box hover:bg-base-content/10 {playing
            ? 'bg-info/15'
            : ''}"
    >
        <button
            class="btn btn-sm btn-square {playing ? 'btn-info' : 'btn-ghost'}"
            aria-label={playing ? "Stoppen" : "Für alle abspielen"}
            title={playing
                ? "Stoppen"
                : sound.kind === "ambience"
                  ? "Für alle dazu abspielen"
                  : "Für alle abspielen"}
            onclick={() =>
                playing
                    ? stop(sound.name)
                    : appState.ws?.send(PlaySound.create(sound.name))}
        >
            <i
                class="fa-solid {playing
                    ? 'fa-stop'
                    : sound.kind === 'effect'
                      ? 'fa-bolt'
                      : 'fa-play'}"
            ></i>
        </button>
        <span class="flex-1 truncate" title={sound.name}>{sound.name}</span>
        <button
            class="btn btn-xs btn-ghost opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            title={BECOME[NEXT_KIND[sound.kind]]}
            onclick={() => switch_kind(sound)}
        >
            <i class="fa-solid {KIND_ICON[NEXT_KIND[sound.kind]]}"></i>
        </button>
        <button
            class="btn btn-xs {confirm_delete === sound.name
                ? 'btn-error'
                : 'btn-ghost btn-square opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'}"
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

{#snippet playing_row(playing: Playing, icon: string)}
    <div class="flex flex-row items-center gap-2 min-w-0">
        <i class="fa-solid {icon} w-4 text-center opacity-70"></i>
        <span class="flex flex-col flex-1 min-w-0">
            <span class="truncate text-sm font-semibold" title={playing.name}
                >{playing.name}</span
            >
            <!-- Relative to the others, for everyone. Each player's own volume still applies. -->
            <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                class="range range-xs"
                aria-label="Lautstärke von {playing.name} im Vergleich"
                title="Wie laut, im Vergleich zu den anderen, für alle"
                value={Math.sqrt(playing.level)}
                oninput={(event) =>
                    change_level(playing.name, Number(event.currentTarget.value))}
                onchange={(event) =>
                    change_level(playing.name, Number(event.currentTarget.value), true)}
            />
        </span>
        <button
            class="btn btn-sm btn-square"
            aria-label="{playing.name} stoppen"
            title="Stoppen"
            onclick={() => stop(playing.name)}
        >
            <i class="fa-solid fa-stop"></i>
        </button>
    </div>
{/snippet}

<div class="p-2 px-4 flex flex-col gap-2 min-h-full">
    <h1 class="text-3xl font-bold">Stimmung</h1>
    <p class="text-sm text-base-content/60">
        Musik läuft für alle in Schleife, ein neues Lied ersetzt das alte. Ambiente wie
        Regen läuft daneben, so viel du willst. Effekte spielen einmal. Musik, Ambiente
        und Wetter merkt sich die Szene, sie kommen wieder, wenn du zu ihr wechselst.
        {#if in_tauri}
            Audiodateien aus dem Explorer kannst du hier hineinziehen.
        {/if}
    </p>
    <WeatherControls />
    <div class="divider my-0"></div>
    <div role="tablist" class="tabs tabs-box tabs-sm">
        <button
            role="tab"
            class="tab flex-1 {view === 'own' ? 'tab-active' : ''}"
            onclick={() => (view = "own")}
        >
            <i class="fa-solid fa-list mr-1.5"></i> Meine Sounds
        </button>
        <button
            role="tab"
            class="tab flex-1 {view === 'library' ? 'tab-active' : ''}"
            onclick={() => (view = "library")}
        >
            <i class="fa-solid fa-compass mr-1.5"></i> Bibliothek
        </button>
    </div>
    {#if audioState.music || audioState.ambience.length}
        <div class="flex flex-col gap-1.5 p-2 rounded-box bg-info/15">
            <span class="flex items-center gap-2 text-xs text-base-content/60">
                <span class="equalizer" aria-hidden="true"
                    ><span></span><span></span><span></span><span></span></span
                >
                Läuft gerade
            </span>
            {#if audioState.music}
                {@render playing_row(audioState.music, "fa-music")}
            {/if}
            {#each audioState.ambience as playing (playing.name)}
                {@render playing_row(playing, "fa-cloud-rain")}
            {/each}
        </div>
    {/if}
    {#if view === "library"}
        <SoundLibrary />
    {:else}
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
        <h2 class="font-bold">Ambiente</h2>
        <ul class="flex flex-col gap-0.5">
            {#each ambience as sound (sound.name)}
                {@render sound_row(sound)}
            {:else}
                <li class="text-sm text-base-content/60">
                    Noch kein Ambiente, wie Regen oder eine Taverne
                </li>
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
    {/if}
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
