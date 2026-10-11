<script lang="ts">
    import { onMount } from "svelte";
    import { dialogs } from "$lib/state.svelte";
    import {
        challenge_rating,
        get_monster,
        monster_info,
        search_monsters,
        SIZE_CELLS,
        type Monster,
    } from "$lib/monsters";
    import StatBlock from "./StatBlock.svelte";

    let dialog: HTMLDialogElement | null = $state(null);

    /** Only showing the stat block of a placed marker, without the search */
    let viewing = $state(false);
    let query = $state("");
    let results: Monster[] = $state([]);
    let searching = $state(false);
    let error = $state("");
    let selected: Monster | null = $state(null);

    function open() {
        // The search stays, but not a monster that was only shown
        if (viewing) selected = results[0] ?? null;
        viewing = false;
        error = "";
        dialog?.showModal();
    }

    let latest_show = 0;

    async function show(key: string) {
        // A slow answer for an earlier monster must not replace this one
        const show_id = ++latest_show;
        viewing = true;
        error = "";
        selected = null;
        dialog?.showModal();
        try {
            const monster = await get_monster(key);
            if (show_id === latest_show) selected = monster;
        } catch (e) {
            console.error("Loading a monster failed", e);
            if (show_id === latest_show) {
                error = "Die Werte konnten nicht von Open5e geladen werden.";
            }
        }
    }

    onMount(() => {
        dialogs.monster = { open, show };
        return () => {
            dialogs.monster = null;
        };
    });

    let search_timeout: ReturnType<typeof setTimeout> | undefined;
    let latest_search = 0;

    function search_soon() {
        clearTimeout(search_timeout);
        search_timeout = setTimeout(search, 300);
    }

    async function search() {
        const text = query.trim();
        // Answers of older searches may arrive after newer ones
        const search_id = ++latest_search;
        if (text.length < 2) {
            results = [];
            searching = false;
            return;
        }
        searching = true;
        error = "";
        try {
            const found = await search_monsters(text);
            if (search_id !== latest_search) return;
            results = found;
            // The first result of a new search, unless the chosen one is still among them
            if (!found.some((monster) => monster.key === selected?.key)) {
                selected = found[0] ?? null;
            }
        } catch (e) {
            console.error("Searching monsters failed", e);
            if (search_id === latest_search) {
                error = "Open5e ist gerade nicht erreichbar.";
            }
        } finally {
            if (search_id === latest_search) searching = false;
        }
    }

    function create_marker(monster: Monster) {
        dialog?.close();
        dialogs.marker?.create_from({
            name: monster.name,
            size: SIZE_CELLS[monster.size?.key] ?? 1,
            max_hp: monster.hit_points,
            monster: monster_info(monster),
        });
    }
</script>

<dialog bind:this={dialog} class="modal scrollbar-gutter-affected">
    <div class="modal-box w-11/12 max-w-4xl">
        <h3 class="text-lg font-bold mb-2">
            {viewing ? "Werte" : "Monster suchen"}
        </h3>
        <div class="flex flex-row gap-4 max-h-[70vh]">
            {#if !viewing}
                <div class="w-64 shrink-0 flex flex-col gap-2 min-h-0">
                    <label class="input input-sm w-full">
                        <i class="fa-solid fa-magnifying-glass opacity-50"></i>
                        <input
                            type="search"
                            placeholder="z. B. Goblin"
                            bind:value={query}
                            oninput={search_soon}
                        />
                        {#if searching}
                            <span class="loading loading-spinner loading-xs"
                            ></span>
                        {/if}
                    </label>
                    <ul class="flex flex-col gap-0.5 overflow-y-auto min-h-0">
                        {#each results as monster (monster.key)}
                            <li>
                                <button
                                    class="w-full text-left p-1 px-2 rounded-field hover:bg-base-content/10 {selected?.key ===
                                    monster.key
                                        ? 'bg-base-content/15'
                                        : ''}"
                                    onclick={() => (selected = monster)}
                                >
                                    <div class="font-bold truncate">
                                        {monster.name}
                                    </div>
                                    <div
                                        class="text-xs text-base-content/60 truncate"
                                    >
                                        HG {challenge_rating(monster)} · {monster
                                            .type?.name} · {monster.document
                                            ?.display_name ??
                                            monster.document?.name}
                                    </div>
                                </button>
                            </li>
                        {:else}
                            <li class="text-sm text-base-content/60 p-2">
                                {query.trim().length < 2
                                    ? "Gib mindestens 2 Buchstaben ein. Die Monster kommen von Open5e und sind auf Englisch."
                                    : searching
                                      ? "Sucht…"
                                      : "Nichts gefunden"}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
            <div class="flex-1 overflow-y-auto min-h-0">
                {#if error}
                    <p class="text-error">{error}</p>
                {:else if selected}
                    <StatBlock monster={selected} />
                {:else if viewing}
                    <span class="loading loading-spinner"></span>
                {/if}
            </div>
        </div>
        {#if selected && !viewing}
            <div class="modal-action mt-2">
                <button
                    class="btn btn-neutral"
                    onclick={() => selected && create_marker(selected)}
                >
                    <i class="fa-solid fa-plus"></i>
                    Als Marker anlegen
                </button>
            </div>
        {/if}
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0">close</button>
    </form>
</dialog>
