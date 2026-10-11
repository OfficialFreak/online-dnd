<script lang="ts">
    import { onMount } from "svelte";
    import {
        adminState,
        appState,
        dialogs,
        gameState,
    } from "$lib/state.svelte";
    import {
        CreateUser,
        DeleteUser,
        ListUsers,
        RegenerateKey,
        SetDm,
    } from "$lib/types/messaging/client_messages";
    import { MessageTypes, notify } from "$lib/notifications.svelte";

    let dialog: HTMLDialogElement | null = $state(null);
    let new_name = $state("");
    let new_dm = $state(false);
    let shown_key: string | null = $state(null);
    /** "delete:Name" or "key:Name" while waiting for the second click */
    let confirm: string | null = $state(null);

    let users = $derived(
        adminState.users.toSorted(
            (a, b) =>
                Number(b.dm) - Number(a.dm) || a.name.localeCompare(b.name),
        ),
    );
    let name_taken = $derived(
        adminState.users.some((user) => user.name === new_name.trim()),
    );

    function open() {
        appState.ws?.send(ListUsers.create());
        dialog?.showModal();
    }

    onMount(() => {
        dialogs.users = { open };
        return () => {
            dialogs.users = null;
        };
    });

    function create_user() {
        const name = new_name.trim();
        if (!name || name_taken) return;
        appState.ws?.send(CreateUser.create(name, new_dm));
        shown_key = name;
        new_name = "";
        new_dm = false;
    }

    async function copy_key(key: string | null | undefined) {
        if (!key) return;
        try {
            await navigator.clipboard.writeText(key);
            notify("Schlüssel kopiert", MessageTypes.Success, 1500);
        } catch {
            notify("Kopieren hat nicht geklappt", MessageTypes.Error, 2000);
        }
    }

    function request(action: string, run: () => void) {
        if (confirm === action) {
            confirm = null;
            run();
            return;
        }
        confirm = action;
        setTimeout(() => {
            if (confirm === action) confirm = null;
        }, 3000);
    }
</script>

<dialog bind:this={dialog} class="modal scrollbar-gutter-affected">
    <div class="modal-box w-11/12 max-w-3xl flex flex-col gap-3">
        <h3 class="text-lg font-bold">Spieler verwalten</h3>
        <p class="text-sm text-base-content/60">
            Jeder meldet sich mit seinem Schlüssel an. Ein neuer Schlüssel
            meldet den Spieler ab, der alte gilt dann nicht mehr. DM-Rechte
            wirken beim nächsten Verbinden.
        </p>
        <div class="overflow-x-auto">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>DM</th>
                        <th>Schlüssel</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {#each users as user (user.name)}
                        {@const self = user.name === gameState.name}
                        <tr>
                            <td>
                                <span
                                    class="status {user.online
                                        ? 'status-success'
                                        : 'status-neutral'}"
                                    title={user.online ? "Online" : "Offline"}
                                ></span>
                                {user.name}
                                {#if self}
                                    <span class="badge badge-xs">Du</span>
                                {/if}
                            </td>
                            <td>
                                <input
                                    type="checkbox"
                                    class="toggle toggle-sm"
                                    checked={user.dm}
                                    disabled={self}
                                    title={self
                                        ? "Deine eigenen Rechte kannst du nicht ändern"
                                        : "DM-Rechte"}
                                    onchange={(event) =>
                                        appState.ws?.send(
                                            SetDm.create(
                                                user.name,
                                                event.currentTarget.checked,
                                            ),
                                        )}
                                />
                            </td>
                            <td class="font-mono text-xs">
                                {#if !user.key}
                                    <span class="text-base-content/50"
                                        >keiner</span
                                    >
                                {:else if shown_key === user.name}
                                    {user.key}
                                {:else}
                                    ••••{user.key.slice(-4)}
                                {/if}
                            </td>
                            <td class="flex flex-row gap-1 justify-end">
                                {#if user.key}
                                    <button
                                        class="btn btn-xs btn-ghost btn-square"
                                        title={shown_key === user.name
                                            ? "Verbergen"
                                            : "Anzeigen"}
                                        aria-label="Schlüssel anzeigen"
                                        onclick={() =>
                                            (shown_key =
                                                shown_key === user.name
                                                    ? null
                                                    : user.name)}
                                    >
                                        <i
                                            class="fa-solid {shown_key ===
                                            user.name
                                                ? 'fa-eye-slash'
                                                : 'fa-eye'}"
                                        ></i>
                                    </button>
                                    <button
                                        class="btn btn-xs btn-ghost btn-square"
                                        title="Kopieren"
                                        aria-label="Schlüssel kopieren"
                                        onclick={() => copy_key(user.key)}
                                    >
                                        <i class="fa-solid fa-copy"></i>
                                    </button>
                                {/if}
                                <button
                                    class="btn btn-xs {confirm ===
                                    `key:${user.name}`
                                        ? 'btn-warning'
                                        : 'btn-ghost'}"
                                    title="Neuer Schlüssel, der alte gilt nicht mehr"
                                    onclick={() =>
                                        request(`key:${user.name}`, () => {
                                            appState.ws?.send(
                                                RegenerateKey.create(user.name),
                                            );
                                            shown_key = user.name;
                                        })}
                                >
                                    {confirm === `key:${user.name}`
                                        ? "Neu?"
                                        : "Neuer Schlüssel"}
                                </button>
                                {#if !self}
                                    <button
                                        class="btn btn-xs {confirm ===
                                        `delete:${user.name}`
                                            ? 'btn-error'
                                            : 'btn-ghost btn-square'}"
                                        aria-label="Spieler löschen"
                                        title="Löschen"
                                        onclick={() =>
                                            request(`delete:${user.name}`, () =>
                                                appState.ws?.send(
                                                    DeleteUser.create(
                                                        user.name,
                                                    ),
                                                ),
                                            )}
                                    >
                                        {#if confirm === `delete:${user.name}`}
                                            Löschen?
                                        {:else}
                                            <i class="fa-solid fa-trash"></i>
                                        {/if}
                                    </button>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <form
            class="flex flex-row flex-wrap items-end gap-2"
            onsubmit={(event) => {
                event.preventDefault();
                create_user();
            }}
        >
            <fieldset class="fieldset">
                <legend class="fieldset-legend">Neuer Spieler</legend>
                <input
                    type="text"
                    class="input input-sm {name_taken ? 'input-error' : ''}"
                    placeholder="Name"
                    maxlength="40"
                    bind:value={new_name}
                />
            </fieldset>
            <label class="label text-sm mb-2">
                <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    bind:checked={new_dm}
                />
                DM
            </label>
            <button
                class="btn btn-sm btn-neutral mb-1"
                disabled={!new_name.trim() || name_taken}
            >
                Anlegen
            </button>
            {#if name_taken}
                <span class="text-error text-sm mb-2"
                    >Den Namen gibt es schon</span
                >
            {/if}
        </form>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button class="outline-0">close</button>
    </form>
</dialog>
