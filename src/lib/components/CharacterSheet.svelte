<script lang="ts">
    import { CheckResult } from "$lib/types/messaging/client_messages";
    import {
        appState,
        gameState,
        roller,
        update_initiative,
    } from "../state.svelte";
    import SavingStat from "./CharacterSheet/SavingStat.svelte";
    import Sense from "./CharacterSheet/Sense.svelte";
    import Stat from "./CharacterSheet/Stat.svelte";

    let { character } = $props();

    async function roll_initiative() {
        if (!roller.value || !appState.ws) return;
        let name = character.name;
        let initiative = character.actualInitiative;
        let result = await roller.value(["1d20"], initiative);
        await appState.ws.send(
            CheckResult.create("initiative", result.roll_result, initiative),
        );
        let char_init = gameState.scene?.state.initiative.find(
            (initiative) => initiative[1] === name,
        );
        if (char_init) {
            char_init[0] = result.roll_result + initiative;
        } else {
            if (
                gameState.scene?.state.markers.some(
                    (marker) => marker.name === name,
                )
            ) {
                gameState.scene?.state.initiative.push([
                    result.roll_result + initiative,
                    name,
                ]);
            } else {
                return;
            }
        }
        await update_initiative();
    }
</script>

<div class="w-full grow flex flex-col relative pb-4">
    <img
        class="absolute top-0 left-0 -z-10 w-full h-full object-cover object-center rounded-box"
        style="filter: brightness(0.7)"
        src={character.decorations.backdropAvatarUrl ||
            "https://www.dndbeyond.com/avatars/43993/228/638609652442536203.jpeg"}
        alt="Background"
    />

    <div
        class="grid grid-cols-5 grid-rows-2 gap-2 frosted dark-frosted px-2 pt-2"
    >
        <div class="relative flex justify-center items-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 79 90" class=""
                ><path
                    fill="var(--color-base-200)"
                    d="M72.8,30.7v13.7c-1,3.6-9.7,30.9-31.9,38.6c-0.3-0.4-0.8-0.7-1.4-0.7c-0.6,0-1,0.3-1.4,0.7 C26,78.7,17.9,68.6,12.9,59.8c0,0,0,0,0,0c-0.3-0.5-0.6-1-0.8-1.5c-3.6-6.7-5.4-12.4-5.9-14V30.7c0.7-0.3,1.2-0.9,1.2-1.7 c0-0.1,0-0.2-0.1-0.3c6.2-4,8.5-11.5,9.2-15.2L38.1,7c0.3,0.4,0.8,0.7,1.4,0.7c0.6,0,1.1-0.3,1.4-0.7l21.4,6.6 c0.8,3.6,3,11.1,9.2,15.2V29c0,0.2,0,0.4,0.1,0.6C71.8,30.1,72.3,30.5,72.8,30.7z"
                ></path><path
                    fill={character.decorations.themeColor?.themeColor ||
                        "var(--color-base-200)"}
                    d="M73.2,27.3c-0.4,0-0.8,0.2-1.1,0.4c-5.8-3.9-7.9-11.3-8.6-14.5l-0.1-0.4l-22-6.7c-0.1-0.9-0.8-1.7-1.8-1.7 s-1.7,0.8-1.8,1.7l-22,6.7l-0.1,0.4c-0.6,3.2-2.7,10.6-8.6,14.5c-0.3-0.3-0.7-0.4-1.1-0.4c-1,0-1.8,0.8-1.8,1.9 c0,0.8,0.5,1.5,1.2,1.7v13.5v0.2c0.9,3.2,9.7,31.2,32.4,39.2c0.1,1,0.8,1.8,1.8,1.8s1.8-0.8,1.8-1.8c9.3-3.3,17.3-10.1,23.8-20.4 c5.3-8.4,7.9-16.5,8.6-18.8V30.9c0.7-0.3,1.2-0.9,1.2-1.7C75,28.1,74.2,27.3,73.2,27.3z M72.5,44.3c-1,3.6-9.6,30.5-31.5,38.2 c-0.3-0.4-0.8-0.7-1.4-0.7c-0.6,0-1,0.3-1.4,0.7C16.3,74.8,7.8,47.9,6.7,44.3V30.9c0.7-0.3,1.2-0.9,1.2-1.7c0-0.1,0-0.2-0.1-0.3 c6.1-4,8.4-11.4,9.1-15l21.3-6.5c0.3,0.4,0.8,0.7,1.4,0.7c0.6,0,1.1-0.3,1.4-0.7l21.2,6.5c0.8,3.6,3,11,9.1,15c0,0.1,0,0.2,0,0.3 c0,0.8,0.5,1.5,1.2,1.7V44.3z M73.2,27.3c-0.4,0-0.8,0.2-1.1,0.4c-5.8-3.9-7.9-11.3-8.6-14.5l-0.1-0.4l-22-6.7 c-0.1-0.9-0.8-1.7-1.8-1.7s-1.7,0.8-1.8,1.7l-22,6.7l-0.1,0.4c-0.6,3.2-2.7,10.6-8.6,14.5c-0.3-0.3-0.7-0.4-1.1-0.4 c-1,0-1.8,0.8-1.8,1.9c0,0.8,0.5,1.5,1.2,1.7v13.5v0.2c0.9,3.2,9.7,31.2,32.4,39.2c0.1,1,0.8,1.8,1.8,1.8s1.8-0.8,1.8-1.8 c9.3-3.3,17.3-10.1,23.8-20.4c5.3-8.4,7.9-16.5,8.6-18.8V30.9c0.7-0.3,1.2-0.9,1.2-1.7C75,28.1,74.2,27.3,73.2,27.3z M72.5,44.3 c-1,3.6-9.6,30.5-31.5,38.2c-0.3-0.4-0.8-0.7-1.4-0.7c-0.6,0-1,0.3-1.4,0.7C16.3,74.8,7.8,47.9,6.7,44.3V30.9 c0.7-0.3,1.2-0.9,1.2-1.7c0-0.1,0-0.2-0.1-0.3c6.1-4,8.4-11.4,9.1-15l21.3-6.5c0.3,0.4,0.8,0.7,1.4,0.7c0.6,0,1.1-0.3,1.4-0.7 l21.2,6.5c0.8,3.6,3,11,9.1,15c0,0.1,0,0.2,0,0.3c0,0.8,0.5,1.5,1.2,1.7V44.3z M78.1,24.5c-8.7-1.8-9.9-14.9-9.9-15l-0.1-0.8L39.5,0 L10.9,8.7l-0.1,0.8c0,0.1-1.2,13.3-9.9,15l-1,0.2v20.4v0.3C0,45.8,9.6,82.1,39.1,89.9l0.3,0.1l0.3-0.1C69.5,82.1,79,45.8,79.1,45.4 V24.7L78.1,24.5z M76.7,45C76,47.5,66.6,80.1,39.5,87.5C12.6,80.1,3.2,47.4,2.5,45V26.7c8.3-2.4,10.3-13,10.7-16.1l26.4-8l26.4,8 c0.4,3.1,2.4,13.7,10.7,16.1V45z M63.5,13.2l-0.1-0.4l-22-6.7c-0.1-0.9-0.8-1.7-1.8-1.7s-1.7,0.8-1.8,1.7l-22,6.7l-0.1,0.4 c-0.6,3.2-2.7,10.6-8.6,14.5c-0.3-0.3-0.7-0.4-1.1-0.4c-1,0-1.8,0.8-1.8,1.9c0,0.8,0.5,1.5,1.2,1.7v13.5v0.2 c0.9,3.2,9.7,31.2,32.4,39.2c0.1,1,0.8,1.8,1.8,1.8s1.8-0.8,1.8-1.8c9.3-3.3,17.3-10.1,23.8-20.4c5.3-8.4,7.9-16.5,8.6-18.8V30.9 c0.7-0.3,1.2-0.9,1.2-1.7c0-1-0.8-1.9-1.8-1.9c-0.4,0-0.8,0.2-1.1,0.4C66.2,23.9,64.1,16.4,63.5,13.2z M72.5,30.9v13.5 c-1,3.6-9.6,30.5-31.5,38.2c-0.3-0.4-0.8-0.7-1.4-0.7c-0.6,0-1,0.3-1.4,0.7C16.3,74.8,7.8,47.9,6.7,44.3V30.9 c0.7-0.3,1.2-0.9,1.2-1.7c0-0.1,0-0.2-0.1-0.3c6.1-4,8.4-11.4,9.1-15l21.3-6.5c0.3,0.4,0.8,0.7,1.4,0.7c0.6,0,1.1-0.3,1.4-0.7 l21.2,6.5c0.8,3.6,3,11,9.1,15c0,0.1,0,0.2,0,0.3C71.3,30,71.8,30.6,72.5,30.9z"
                ></path></svg
            >
            <span class="absolute top-1/2 left-1/2 -translate-1/2"
                >{character.armorClass}</span
            >
        </div>
        <div
            class="flex justify-center items-center flex-col text-xs font-bold"
        >
            <span>Initiative</span>
            <button class="btn" onclick={roll_initiative}>
                {character.actualInitiative > 0
                    ? "+"
                    : ""}{character.actualInitiative}
            </button>
        </div>
        <div class="col-start-1 row-start-2 flex justify-center items-center">
            <div class="tooltip" data-tip="Kurze Rast">
                <button
                    class="btn w-full uppercase"
                    aria-label="Short Rest"
                    disabled
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 75.00001 91.37608"
                        class="w-5 aspect-square !fill-base-content/30"
                        ><path
                            d="M58.745,34.053c-8.41376-5.41754,0-15.47864,0-15.47864C44.08877,22.05707,44.77651,32,44.77651,32c-4.07116-2.51532-3.67328-7.23413.94074-16.52136S37.032,0,37.032,0s12.21356,13.15686-8.68518,24.76587-8.68518,24.76587-8.68518,24.76587A16.47186,16.47186,0,0,1,6.63387,43.34027c0,10.289,10.45673,17.73334,21.37586,20.491a17.23033,17.23033,0,0,1-2.96533-7.19837c-.04621-.27893.12744-.6784.48211-.63293a17.25615,17.25615,0,0,1,8.43189,3.63074,21.50626,21.50626,0,0,0,1.09772-5.22364c.37316-4.59375-1.6828-8.0484-4.21137-11.65478-.27563-.39319.18073-.80023.5647-.7345a12.743,12.743,0,0,1,10.2716,10.49347c4.52625-1.53119,6.34034-7.317,6.42878-11.678.01117-.55072.86242-.697.98217-.13293,1.39893,6.59,6.35651,14.61285,2.942,21.23028C66.09347,54.97485,65.35421,38.30859,58.745,34.053Z"
                        ></path><path
                            fill="color-mix(in srgb, var(--color-base-content), transparent 70%)"
                            d="M4.3,73.47608l10,2.7,18.3-5s-27.2-7.4-27.7-7.4a4.908,4.908,0,0,0-4.9,4.9A4.78148,4.78148,0,0,0,4.3,73.47608Z"
                        ></path><path
                            fill="color-mix(in srgb, var(--color-base-content), transparent 70%)"
                            d="M70.1,63.77607c-.7,0-65.8,17.9-65.8,17.9a4.83787,4.83787,0,0,0-4.1,4.8,4.908,4.908,0,0,0,4.9,4.9c.6,0,65.8-17.9,65.8-17.9a4.83788,4.83788,0,0,0,4.1-4.8A4.908,4.908,0,0,0,70.1,63.77607Z"
                        ></path><path
                            fill="color-mix(in srgb, var(--color-base-content), transparent 70%)"
                            d="M70.9,81.67607l-10.3-2.8-18.3,5s27.2,7.5,27.8,7.5a4.8815,4.8815,0,0,0,.8-9.7Z"
                        ></path></svg
                    >
                </button>
            </div>
        </div>
        <div class="col-start-2 row-start-2 flex justify-center items-center">
            <div class="tooltip" data-tip="Lange Rast">
                <button
                    class="btn w-full uppercase"
                    aria-label="Long Rest"
                    disabled
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 443.5 443.5"
                        class="w-5 aspect-square fill-base-content/30"
                        ><path
                            d="M221.75.25c122.33,0,221.5,99.17,221.5,221.5s-99.17,221.5-221.5,221.5S.25,344.08.25,221.75,99.42.25,221.75.25ZM370.58,353.13c69.03-39.84,83.21-144.48,31.66-233.72C350.7,30.17,252.96-9.88,183.92,29.97c-69.03,39.84-83.21,144.48-31.66,233.72C203.8,352.93,301.54,392.98,370.58,353.13Z"
                        ></path><ellipse
                            fill="none"
                            stroke="var(--color-base-100)"
                            stroke-miterlimit="10"
                            stroke-width="10px"
                            cx="277.25"
                            cy="191.55"
                            rx="144.3145"
                            ry="186.5974"
                            transform="matrix(0.86569, -0.50058, 0.50058, 0.86569, -58.64876, 164.51324)"
                        ></ellipse></svg
                    >
                </button>
            </div>
        </div>
        <div
            class="row-span-2 col-start-3 row-start-1 flex flex-col gap-1 items-center"
        >
            <button>
                <!-- class="cursor-pointer" disabled -->
                <img
                    class="w-full object-center object-cover rounded-box border aspect-3/4"
                    style="border-color: {character.decorations.themeColor
                        ?.themeColor || 'black'}"
                    src={character.decorations.avatarUrl ||
                        "https://www.dndbeyond.com/Content/Skins/Waterdeep/images/characters/default-avatar-builder.png"}
                    alt={character.name}
                />
            </button>
            <span class="text-xs text-center">Heroic Inspiration</span>
        </div>
        <button
            class="btn col-span-2 col-start-4 row-start-1 flex flex-col justify-center items-center gap-0.5 h-full"
            disabled
        >
            <span class="text-xs uppercase font-bold">hit points</span>
            <span class="text-sm"
                >{character.currentHealth}/{character.maxHealth}</span
            >
            <progress
                class="progress progress-error w-full"
                value={character.currentHealth}
                max={character.maxHealth}
            ></progress>
        </button>
        <div
            class="col-span-2 col-start-4 row-start-2 flex justify-center items-center"
        >
            <button class="btn w-full uppercase" disabled>Conditions</button>
        </div>
    </div>

    <!-- <div class="dropdown -mt-1">
        <div tabindex="0" role="button" class="btn !text-xs px-2 w-full rounded-t-none">
            Abilities, Saves, Senses
        </div>
        <ul class="dropdown-content menu bg-base-100 rounded-box z-1 w-full p-2 shadow-sm">
            <li><button class="btn btn-ghost justify-start">Abilities, Saves, Senses</button></li>
            <li><button class="btn btn-ghost justify-start">Skills</button></li>
            <li><button class="btn btn-ghost justify-start">Actions</button></li>
        </ul>
    </div> -->

    <div class="relative w-full h-full grow mt-1">
        <div class="w-full flex flex-wrap gap-y-1">
            {#each { length: 6 }, stat}
                <Stat {stat} {character} />
            {/each}
        </div>
        <div class="divider text-white">Saving Throws</div>
        <div class="w-full flex flex-wrap gap-y-1">
            {#each [0, 3, 1, 4, 2, 5] as stat}
                <SavingStat {stat} {character} />
            {/each}
        </div>
        <div class="divider text-white">Senses</div>
        <div class="w-full flex flex-wrap gap-y-1">
            {#each [0, 1, 2] as stat}
                <Sense {stat} {character} />
            {/each}
        </div>
        {#if Object.keys(character.specialSenses).length}
            <div
                style="border-color: {character.decorations.themeColor
                    ?.themeColor || 'black'}"
                class="flex flex-col gap-2 my-2 mx-1 py-1 text-center rounded-box justify-center frosted dark-frosted text-base-content/80"
            >
                {#each Object.entries(character.specialSenses) as [name, distance]}
                    <span
                        ><div class="capitalize inline">{name}</div>
                        {distance} ft.</span
                    >
                {/each}
            </div>
        {/if}
    </div>
</div>
