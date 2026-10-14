<script lang="ts">
    import { dragSource } from "$lib/drag.svelte";
    import {
        activate_scene,
        appState,
        delete_scene,
        dialogs,
        gameState,
    } from "$lib/state.svelte";
    import {
        ForgetSceneMusic,
        PreloadResource,
    } from "$lib/types/messaging/client_messages";
    import { weather_icons } from "$lib/weather";
    import { import_uvtt } from "$lib/uvtt";
    import { uploadState } from "$lib/upload.svelte";
    import Display from "./Display.svelte";

    let search = $state("");
    let confirm_delete: string | null = $state(null);
    let confirm_timeout: ReturnType<typeof setTimeout> | undefined;

    let scenes = $derived(
        gameState.scenes
            .filter((scene) =>
                scene.name.toLowerCase().includes(search.trim().toLowerCase()),
            )
            .toSorted((a, b) => a.name.localeCompare(b.name)),
    );

    // Hovering a scene asks everyone to preload its map, at most every 10 seconds per map
    const PRELOAD_COOLDOWN_MS = 10_000;
    const last_preload = new globalThis.Map<string, number>();

    function send_preload(file: string) {
        if (!appState.ws) return;
        const now = Date.now();
        if (now - (last_preload.get(file) ?? 0) < PRELOAD_COOLDOWN_MS) return;
        last_preload.set(file, now);
        appState.ws.send(PreloadResource.create(file));
    }

    /**
     * Only once the pointer stays on a scene a moment, or it is grabbed: moving down the
     * list made every player load each scene's whole map on the way, phones too
     */
    let preload_timer: ReturnType<typeof setTimeout> | undefined;
    function preload_soon(file: string) {
        clearTimeout(preload_timer);
        preload_timer = setTimeout(() => send_preload(file), 350);
    }

    function request_delete(name: string) {
        if (confirm_delete === name) {
            confirm_delete = null;
            delete_scene(name);
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

<div class="p-2 px-4 flex flex-col gap-2 min-h-full">
    <h1 class="text-3xl font-bold">Szenen</h1>
    <label class="input input-sm w-full">
        <i class="fa-solid fa-magnifying-glass opacity-50"></i>
        <input type="search" placeholder="Suchen" bind:value={search} />
    </label>
    <ul class="flex flex-col gap-1">
        {#each scenes as scene (scene.name)}
            {@const active = gameState.scene?.name === scene.name}
            <li
                class="group flex flex-row items-center gap-2 p-1 rounded-box hover:bg-base-content/10 cursor-grab active:cursor-grabbing select-none touch-pan-y {active
                    ? 'bg-info/15'
                    : ''}"
                use:dragSource={{ kind: "scene", scene }}
                onmouseenter={() => preload_soon(scene.map_file)}
                onmouseleave={() => clearTimeout(preload_timer)}
                onpointerdown={() => send_preload(scene.map_file)}
            >
                <!-- The small picture of the map with its grid. A whole map each, with its
                     listeners and all it works out, stayed in the panel for every scene. -->
                <div
                    class="@container relative w-24 shrink-0 rounded-field overflow-hidden pointer-events-none"
                >
                    <Display
                        asset={scene.map_file}
                        thumbnail={true}
                        alt=""
                        class="w-full block"
                        loading="lazy"
                        decoding="async"
                    />
                    <div
                        class="absolute inset-0"
                        style="background: linear-gradient(to right, rgb(0 0 0 / 0.5) 1px, transparent 1px) 0 0 / calc(100cqw / {scene.columns}) 100%, linear-gradient(to bottom, rgb(0 0 0 / 0.5) 1px, transparent 1px) 0 0 / 100% calc(100cqw / {scene.columns})"
                    ></div>
                </div>
                <div class="flex-1 min-w-0 flex flex-col">
                    <span class="font-bold truncate" title={scene.name}
                        >{scene.name}</span
                    >
                    {#if active}
                        <span class="badge badge-info badge-xs">Aktiv</span>
                    {/if}
                    {#if scene.music || scene.ambience?.length || weather_icons(scene.weather).length}
                        <span
                            class="flex items-center gap-1.5 text-xs text-base-content/60 min-w-0"
                        >
                            {#each weather_icons(scene.weather) as icon (icon)}
                                <i class="fa-solid {icon}"></i>
                            {/each}
                            {#if scene.music}
                                <span
                                    class="truncate"
                                    title="Spielt, wenn du zu der Szene wechselst"
                                >
                                    <i
                                        class="fa-solid {scene.music.kind ===
                                        'song'
                                            ? 'fa-music'
                                            : 'fa-volume-xmark'}"
                                    ></i>
                                    {scene.music.kind === "song"
                                        ? scene.music.name
                                        : "Stille"}
                                </span>
                            {/if}
                            {#if scene.ambience?.length}
                                <span
                                    class="truncate"
                                    title="Läuft daneben, wenn du zu der Szene wechselst"
                                >
                                    <i class="fa-solid fa-cloud-rain"></i>
                                    {scene.ambience.join(", ")}
                                </span>
                            {/if}
                            {#if scene.music || scene.ambience?.length}
                                <button
                                    class="btn btn-ghost btn-xs btn-square -my-1"
                                    aria-label="Musik und Ambiente der Szene vergessen"
                                    title="Nicht mehr mit der Szene starten"
                                    onclick={() =>
                                        appState.ws?.send(
                                            ForgetSceneMusic.create(scene.name),
                                        )}
                                >
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            {/if}
                        </span>
                    {/if}
                </div>
                <!-- Only while hovering, so the names get the space otherwise -->
                <button
                    class="btn btn-ghost btn-square btn-sm hidden group-hover:inline-flex group-focus-within:inline-flex"
                    aria-label="Szene bearbeiten"
                    title="Bearbeiten"
                    onclick={() => dialogs.scene?.edit(scene)}
                >
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button
                    class="btn btn-sm {confirm_delete === scene.name
                        ? 'btn-error'
                        : 'btn-ghost btn-square hidden group-hover:inline-flex group-focus-within:inline-flex'}"
                    aria-label="Szene löschen"
                    title={active
                        ? "Die aktive Szene kann nicht gelöscht werden"
                        : "Löschen"}
                    disabled={active}
                    onclick={() => request_delete(scene.name)}
                >
                    {#if confirm_delete === scene.name}
                        Löschen?
                    {:else}
                        <i class="fa-solid fa-trash"></i>
                    {/if}
                </button>
                <button
                    class="btn btn-ghost btn-square btn-sm"
                    aria-label="Szene aktivieren"
                    title="Aktivieren"
                    disabled={active}
                    onclick={() => activate_scene(scene.name)}
                >
                    <i class="fa-solid fa-play"></i>
                </button>
            </li>
        {:else}
            <li class="text-center text-base-content/60 py-4">
                {search ? "Keine Szene gefunden" : "Noch keine Szenen"}
            </li>
        {/each}
    </ul>
    <button
        class="btn"
        onclick={() => {
            dialogs.scene?.open();
        }}>Szene erstellen</button
    >
    <button
        class="btn btn-soft"
        disabled={uploadState.uploading}
        title="Universal VTT (.dd2vtt) aus Dungeon Alchemist, animierte Karten mit ihrem Video"
        onclick={import_uvtt}
    >
        {#if uploadState.uploading}
            <span class="loading loading-spinner"></span>
            {#if uploadState.progress === null || uploadState.progress >= 1}
                Wird verarbeitet…
            {:else}
                Wird hochgeladen… {Math.round(uploadState.progress * 100)} %
            {/if}
        {:else}
            <i class="fa-solid fa-dungeon"></i> Karte mit Wänden importieren
        {/if}
    </button>
</div>
