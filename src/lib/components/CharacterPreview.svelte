<script lang="ts">
    import { ImportCharacter } from "$lib/types/messaging/client_messages";
    import { MessageTypes, notify } from "../notifications.svelte";
    import { appState, gameState } from "../state.svelte";
    import StatusEffectBar from "./StatusEffectBar.svelte";

    let { character, callback = null } = $props();

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
</script>

<div class="relative grow border border-base-200 rounded-[4px] flex flex-col">
    <div
        class="absolute inset-0 -z-1 bg-cover brightness-30 pointer-events-none rounded-[4px]"
        style="background-image: url('{character.decorations
            .backdropAvatarUrl ||
            'https://www.dndbeyond.com/avatars/43993/228/638609652442536203.jpeg'}')"
    ></div>
    <div class="p-1 flex flex-row gap-2 items-center">
        <div
            class="h-22 aspect-square p-1 mask mask-hexagon"
            style="background: {character.decorations.themeColor?.themeColor ||
                'black'}"
        >
            <img
                src={character.decorations.avatarUrl ||
                    "https://www.dndbeyond.com/Content/Skins/Waterdeep/images/characters/default-avatar-builder.png"}
                alt="Character"
                class="mask mask-hexagon h-20 aspect-square object-cover object-top"
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
        class="tooltip tooltip-bottom -my-[5px]"
        data-tip={`${character.currentHealth} / ${character.maxHealth}`}
    >
        <progress
            class="progress progress-error w-full"
            value={character.currentHealth}
            max={character.maxHealth}
        ></progress>
    </div>
    {#if (gameState.dm || character.player_name === gameState.name) && callback !== null}
        <button
            class="btn btn-ghost btn-square absolute top-1 right-1 btn-sm"
            aria-label="Character ansehen"
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
                aria-label="Aktualisiren"
                onclick={updateCharacter}
            >
                <i class="fa-solid fa-rotate-right"></i>
            </button>
        </div>
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
