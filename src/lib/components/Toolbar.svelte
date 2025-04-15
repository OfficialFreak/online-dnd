<script lang="ts">
    import { PutScene } from "$lib/types/messaging/client_messages";
    import { fade } from "svelte/transition";
    import { appState, fogState, gameState, markerModal, Tools } from "../../routes/state.svelte";
    import { MessageTypes, notify } from "../../routes/notifications.svelte";

    function selectTool(tool: Tools) {
        if (appState.selected_tool === tool) {
            appState.selected_tool = Tools.None;
        } else {
            appState.selected_tool = tool
        }
    }

    function saveSceneFog() {
        if (!appState.ws || !gameState.scene) return;
        appState.ws.send(PutScene.update_fog(gameState.scene.state.fog_squares));
        notify("Nebel aktualisiert", MessageTypes.Success, 1000);
    }

    $effect(() => {
        if (fog_active && gameState.scene && fogState.selected_player === "all") {
            let all_compatible = false;
            if (gameState.users.length > 0) {
                all_compatible = true;
                let fog = JSON.stringify(gameState.scene.state.fog_squares[gameState.users[0].name]);
                for (const player of gameState.users) {
                    if (fog !== JSON.stringify(gameState.scene.state.fog_squares[player.name])) {
                        all_compatible = false;
                        break;
                    }
                }
            }
            if (all_compatible) return;
            gameState.scene.state.fog_squares = {};
            for (const player of gameState.users) {
                gameState.scene.state.fog_squares[player.name] = [];
            }
        }
    });

    let fog_active = $derived(appState.selected_tool === Tools.AddFog || appState.selected_tool === Tools.RemoveFog);
</script>

<div class="flex flex-col gap-1 p-0.5 frosted rounded-md" transition:fade|global={{duration: 100}}>
    <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.Pointer && 'btn-info'}" aria-label="Fog" onclick={() => {selectTool(Tools.Pointer)}}><i class="fa-solid fa-arrow-pointer"></i></button>
    {#if gameState.dm}
    <div class="dropdown dropdown-right dropdown-hover">
        <button tabindex="0" class="btn btn-square btn-sm {fog_active && 'btn-info'}" aria-label="Fog"><i class="fa-solid fa-cloud"></i></button>
        <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 shadow-sm">
            <li>
                <legend class="fieldset-legend pointer-events-none">Spieler wählen</legend>
                <select class="select select-sm !bg-[var(--color-base-100)]" bind:value={fogState.selected_player}>
                    <option value="all">Alle</option>
                    {#each gameState.users as player}
                        <option value={player.name}>{#if player.active}🟢{:else}🔴{/if} {player.name}</option>
                    {/each}
                </select>
            </li>
            <li class="flex flex-row gap-1 mt-1">
                <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.AddFog && 'btn-info'}" aria-label="Fog" onclick={() => {selectTool(Tools.AddFog)}}><i class="fa-solid fa-pen"></i></button>
                <button tabindex="0" class="btn btn-square btn-sm {appState.selected_tool === Tools.RemoveFog && 'btn-info'}" aria-label="Fog" onclick={() => {selectTool(Tools.RemoveFog)}}><i class="fa-solid fa-eraser"></i></button>
                <button tabindex="0" class="btn btn-neutral btn-sm self-end ml-5" onclick={saveSceneFog}>
                    <i class="fa-solid fa-check"></i>
                    Bestätigen
                </button>
            </li>
        </ul>
    </div>
    <button tabindex="0" class="btn btn-square btn-sm" aria-label="Marker" onclick={() => {markerModal.value?.showModal();}}>
        <i class="fa-solid fa-user"></i>
    </button>
    {/if}
</div>

<style>
    .frosted {
        background: rgba(28, 34, 41, 0.59);
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(7.5px);
        -webkit-backdrop-filter: blur(7.5px);
        border: 1px solid rgba(28, 34, 41, 0.12);
    }
</style>