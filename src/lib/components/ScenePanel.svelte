<script lang="ts">
    import { dragSource } from "$lib/drag.svelte";
    import {
        activate_scene,
        appState,
        delete_scene,
        dialogs,
        gameState,
    } from "$lib/state.svelte";
    import { PreloadResource } from "$lib/types/messaging/client_messages";
    import Map from "./Map.svelte";

    let search = $state("");
    let confirm_delete: string | null = $state(null);

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

    function request_delete(name: string) {
        if (confirm_delete === name) {
            confirm_delete = null;
            delete_scene(name);
            return;
        }
        confirm_delete = name;
        setTimeout(() => {
            if (confirm_delete === name) confirm_delete = null;
        }, 3000);
    }
</script>

<div class="p-2 px-4 flex flex-col gap-2 min-h-full">
    <h1 class="text-3xl font-bold">Szenen</h1>
    <p class="text-sm text-base-content/60">
        Zieh eine Szene auf die Karte oder klick auf <i
            class="fa-solid fa-play text-xs"
        ></i>, um sie zu aktivieren. Bilder aus dem Explorer kannst du hier
        hineinziehen, um neue Szenen zu erstellen.
    </p>
    <label class="input input-sm w-full">
        <i class="fa-solid fa-magnifying-glass opacity-50"></i>
        <input type="search" placeholder="Suchen" bind:value={search} />
    </label>
    <ul class="flex flex-col gap-1">
        {#each scenes as scene (scene.name)}
            {@const active = gameState.scene?.name === scene.name}
            <li
                class="group flex flex-row items-center gap-2 p-1 rounded-box hover:bg-base-content/10 cursor-grab active:cursor-grabbing select-none touch-none {active
                    ? 'bg-info/15'
                    : ''}"
                use:dragSource={{ kind: "scene", scene }}
                onmouseenter={() => send_preload(scene.map_file)}
            >
                <div
                    class="w-24 shrink-0 rounded-field overflow-hidden pointer-events-none"
                >
                    <Map
                        file={scene.map_file}
                        columns={scene.columns}
                        x_offset={scene.x_offset}
                        y_offset={scene.y_offset}
                        fog_squares={{}}
                        markers={[]}
                    />
                </div>
                <div class="flex-1 min-w-0 flex flex-col">
                    <span class="font-bold truncate" title={scene.name}
                        >{scene.name}</span
                    >
                    {#if active}
                        <span class="badge badge-info badge-xs">Aktiv</span>
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
</div>
