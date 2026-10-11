<script lang="ts">
    import { onMount } from "svelte";
    import { appState } from "$lib/state.svelte";
    import { audioState, effect_volume } from "$lib/audio.svelte";
    import {
        ImportSound,
        ListTabletopAudio,
    } from "$lib/types/messaging/client_messages";
    import {
        search_openverse,
        search_tabletop,
        type LibrarySound,
        type LibrarySource,
    } from "$lib/sound-library";

    const SOURCES: {
        source: LibrarySource;
        label: string;
        icon: string;
        hint: string;
        example: string;
    }[] = [
        {
            source: "ambience",
            label: "Ambiente",
            icon: "fa-cloud-moon",
            hint: "Tabletop Audio: Loops mit Atmosphäre und Musik, für Rollenspiele gemacht",
            example: "Taverne, Höhle, Sturm",
        },
        {
            source: "effects",
            label: "Effekte",
            icon: "fa-bolt",
            hint: "Freesound: Geräusche und Effekte, längere laufen in Schleife",
            example: "Donner, Schwert, Tür",
        },
        {
            source: "music",
            label: "Musik",
            icon: "fa-music",
            hint: "Jamendo: freie Musik",
            example: "episch, Mittelalter, Taverne",
        },
    ];

    let source: LibrarySource = $state("ambience");
    let query = $state("");
    let results: LibrarySound[] = $state([]);
    let loading = $state(false);
    let error = $state("");
    let info = $derived(SOURCES.find((entry) => entry.source === source)!);

    onMount(() => {
        if (!audioState.tabletop) appState.ws?.send(ListTabletopAudio.create());
        return stop_preview;
    });

    let search_timeout: ReturnType<typeof setTimeout> | undefined;
    let latest_search = 0;

    // Tabletop Audio is searched here, the others as soon as the typing pauses
    $effect(() => {
        const text = query.trim();
        const current = source;
        const tracks = audioState.tabletop;
        clearTimeout(search_timeout);
        const search_id = ++latest_search;
        error = "";
        if (current === "ambience") {
            loading = !tracks;
            results = tracks ? search_tabletop(tracks, text) : [];
            return;
        }
        results = [];
        // Not read back from loading, the effect would run again when it changes
        const searching = text.length >= 2;
        loading = searching;
        if (!searching) return;
        search_timeout = setTimeout(async () => {
            try {
                const found = await search_openverse(text, current);
                if (search_id === latest_search) results = found;
            } catch (e) {
                console.error("Searching sounds failed", e);
                if (search_id === latest_search) {
                    error = "Die Suche ist gerade nicht erreichbar.";
                }
            } finally {
                if (search_id === latest_search) loading = false;
            }
        }, 400);
    });

    // Listening before adding, only this DM hears it
    let preview: HTMLAudioElement | null = null;
    let previewing: string | null = $state(null);

    function stop_preview() {
        preview?.pause();
        preview = null;
        previewing = null;
    }

    function toggle_preview(sound: LibrarySound) {
        const was = previewing;
        stop_preview();
        if (was === sound.url) return;
        preview = new Audio(sound.url);
        preview.volume = effect_volume();
        preview.addEventListener("ended", stop_preview);
        preview.play().catch((e) => {
            console.error("Playing the preview failed", e);
            stop_preview();
        });
        previewing = sound.url;
    }

    function in_library(sound: LibrarySound) {
        return audioState.sounds.some((own) => own.name === sound.title);
    }

    function add(sound: LibrarySound) {
        audioState.importing = [...audioState.importing, sound.title];
        appState.ws?.send(ImportSound.create(sound.url, sound.title, sound.kind));
    }
</script>

<div class="flex flex-col gap-2">
    <div class="join w-full">
        {#each SOURCES as entry}
            <button
                class="btn btn-sm join-item flex-1 {source === entry.source
                    ? 'btn-info'
                    : ''}"
                onclick={() => (source = entry.source)}
            >
                <i class="fa-solid {entry.icon}"></i>
                {entry.label}
            </button>
        {/each}
    </div>
    <p class="text-xs text-base-content/60">
        {info.hint}. Die Bibliotheken sind englisch, gängige deutsche Wörter
        werden übersetzt.
    </p>
    <label class="input input-sm w-full">
        <i class="fa-solid fa-magnifying-glass opacity-50"></i>
        <input
            type="search"
            placeholder="z. B. {info.example}"
            bind:value={query}
        />
    </label>
    {#if loading}
        <div class="flex justify-center py-4">
            <span class="loading loading-dots loading-md"></span>
        </div>
    {:else if error}
        <p class="text-sm text-error py-2">{error}</p>
    {:else if results.length === 0}
        <p class="text-sm text-base-content/60 py-2">
            {source !== "ambience" && query.trim().length < 2
                ? "Gib einen Suchbegriff ein."
                : "Nichts gefunden, vielleicht auf Englisch?"}
        </p>
    {:else}
        <ul class="flex flex-col gap-0.5">
            {#each results as sound (sound.url)}
                {@const importing = audioState.importing.includes(sound.title)}
                <li
                    class="flex flex-row items-center gap-1 p-1 rounded-box hover:bg-base-content/10 {previewing ===
                    sound.url
                        ? 'bg-info/15'
                        : ''}"
                >
                    <button
                        class="btn btn-sm btn-square btn-ghost"
                        title={previewing === sound.url
                            ? "Anhalten"
                            : "Anhören, nur du hörst es"}
                        aria-label="Anhören"
                        onclick={() => toggle_preview(sound)}
                    >
                        <i
                            class="fa-solid {previewing === sound.url
                                ? 'fa-stop'
                                : 'fa-headphones'}"
                        ></i>
                    </button>
                    <span class="flex-1 min-w-0 leading-tight">
                        <span class="block truncate text-sm" title={sound.title}
                            >{sound.title}</span
                        >
                        {#if sound.detail}
                            <span
                                class="block truncate text-xs text-base-content/50"
                                title={sound.detail}>{sound.detail}</span
                            >
                        {/if}
                    </span>
                    {#if in_library(sound)}
                        <span
                            class="w-8 text-center text-success"
                            title="Schon in deinen Sounds"
                            ><i class="fa-solid fa-check"></i></span
                        >
                    {:else if importing}
                        <span class="w-8 flex justify-center" title="Wird geladen"
                            ><span class="loading loading-spinner loading-sm"
                            ></span></span
                        >
                    {:else}
                        <button
                            class="btn btn-sm btn-square btn-soft btn-info"
                            title="Zu deinen Sounds hinzufügen"
                            aria-label="Hinzufügen"
                            onclick={() => add(sound)}
                        >
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</div>
