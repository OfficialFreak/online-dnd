<script lang="ts">
    import { ImportCharacter } from "$lib/types/messaging/client_messages";
    import { MessageTypes, notify } from "../notifications.svelte";
    import {
        appState,
        character_marker,
        delete_character,
        gameState,
    } from "../state.svelte";
    import { dragSource } from "../drag.svelte";
    import StatusEffectBar from "./StatusEffectBar.svelte";

    let { character, callback = null } = $props();

    // The DM drags the portrait onto the map to place the character's marker
    let marker = $derived(
        gameState.dm ? character_marker(character.name) : undefined,
    );

    async function updateCharacter() {
        if (!appState.ws) return;
        await appState.ws.send(
            ImportCharacter.create(
                character.readonlyUrl,
                character.player_name,
            ),
        );
        notify("Charakter wird aktualisiert", MessageTypes.Success, 2000);
    }

    let confirm_delete = $state(false);
    let confirm_timeout: ReturnType<typeof setTimeout> | undefined;

    function request_delete() {
        clearTimeout(confirm_timeout);
        if (confirm_delete) {
            confirm_delete = false;
            delete_character(character.id);
            return;
        }
        confirm_delete = true;
        confirm_timeout = setTimeout(() => (confirm_delete = false), 3000);
    }
</script>

<div
    class="group/card relative grow border border-base-200 rounded-[4px] flex flex-col text-white"
>
    <div
        class="absolute inset-0 -z-1 bg-cover brightness-30 pointer-events-none rounded-[4px]"
        style="background-image: url('{character.decorations
            .smallBackdropAvatarUrl ||
            'https://www.dndbeyond.com/avatars/43993/228/638609652442536203.jpeg'}')"
    ></div>
    <div class="p-1 flex flex-row gap-2 items-center">
        <div
            class="h-22 aspect-square p-1 mask mask-hexagon {marker
                ? 'cursor-grab active:cursor-grabbing select-none touch-none'
                : ''}"
            style="background: {character.decorations.themeColor?.themeColor ||
                'black'}"
            title={marker ? "Auf die Karte ziehen" : undefined}
            use:dragSource={marker ? { kind: "marker", marker } : null}
        >
            <!-- Cropped around the middle like on the character sheet: a portrait
                 taken from a phone screenshot has the browser bar at the top -->
            <img
                src={character.decorations.avatarUrl ||
                    "https://www.dndbeyond.com/Content/Skins/Waterdeep/images/characters/default-avatar-builder.png"}
                alt={character.name}
                draggable="false"
                class="mask mask-hexagon h-20 aspect-square object-cover object-center drag-none"
            />
        </div>
        <div class="flex flex-col h-full w-full justify-center">
            <span class="text-lg font-bold group"
                >{character.name}
                <span
                    class="text-gray-400 transition-opacity opacity-0 group-hover:opacity-100"
                    >({character.player_name})</span
                ></span
            >
            <span class="text-gray-400 w-full"
                >{character.detailedDescription}</span
            >
            <span>Level {character.level}</span>
        </div>
    </div>
    <div
        class="tooltip tooltip-bottom -my-1"
        data-tip={`${character.currentHealth} / ${character.maxHealth}`}
    >
        <progress
            class="progress progress-error w-full px-0.5"
            value={character.currentHealth}
            max={character.maxHealth}
        ></progress>
    </div>
    {#if (gameState.dm || character.player_name === gameState.name) && callback !== null}
        <button
            class="btn btn-ghost btn-square absolute top-1 right-1 btn-sm"
            aria-label="Charakter ansehen"
            onclick={callback}
        >
            <i class="fa-solid fa-circle-info"></i>
        </button>
        <div
            class="tooltip tooltip-left absolute bottom-4 right-1"
            data-tip="Charakter von DND Beyond aktualisieren"
        >
            <button
                class="btn btn-ghost btn-square btn-sm"
                aria-label="Aktualisieren"
                onclick={updateCharacter}
            >
                <i class="fa-solid fa-rotate-right"></i>
            </button>
        </div>
    {/if}
    {#if gameState.dm && callback !== null}
        <button
            class="btn btn-sm absolute top-1 right-10 {confirm_delete
                ? 'btn-error'
                : 'btn-ghost btn-square opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100'}"
            aria-label="Charakter löschen"
            title="Charakter löschen"
            onclick={request_delete}
        >
            {#if confirm_delete}
                Löschen?
            {:else}
                <i class="fa-solid fa-trash"></i>
            {/if}
        </button>
    {/if}
    {#if character.activeStatusEffects.length > 0}
        <div
            class="absolute bottom-4 {(gameState.dm ||
                character.player_name === gameState.name) &&
            callback !== null
                ? 'right-10'
                : 'right-1'} scale-60 origin-bottom-right flex justify-end items-end pointer-events-auto -mt-4"
        >
            <div
                class="{(gameState.dm ||
                    character.player_name === gameState.name) &&
                callback !== null
                    ? 'max-w-50'
                    : 'max-w-65'} overflow-x-auto h-26 px-8 flex justify-start items-end no-scrollbar"
            >
                <StatusEffectBar effects={character.activeStatusEffects} />
            </div>
        </div>
    {/if}
</div>
