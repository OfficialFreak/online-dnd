<script lang="ts">
    import { appState, gameState, record_undo } from "$lib/state.svelte";
    import { audioState } from "$lib/audio.svelte";
    import { MOMENTS, send_moment } from "$lib/moments";
    import { SetWeather } from "$lib/types/messaging/client_messages";
    import type { Weather, WeatherSound } from "$lib/types/messaging/server_messages";
    import { CLEAR, flashes_per_minute, PRESETS, thunder_files } from "$lib/weather";
    import throttle from "just-throttle";

    let weather: Weather = $derived({ ...CLEAR, ...(gameState.scene?.weather ?? {}) });

    // Dragging a slider sends a few times a second, not on every step
    const send = throttle(
        (weather: Weather) => appState.ws?.send(SetWeather.create(weather)),
        150,
        { trailing: true },
    );

    let effect_sounds = $derived(
        audioState.sounds
            .filter((sound) => sound.kind === "effect")
            .toSorted((a, b) => a.name.localeCompare(b.name)),
    );
    let ambience_sounds = $derived(
        audioState.sounds
            .filter((sound) => sound.kind === "ambience")
            .toSorted((a, b) => a.name.localeCompare(b.name)),
    );

    let thunders = $derived(thunder_files(weather));

    /** What the ambience going with each weather is called like, to find it in the library */
    const SOUND_NAMES: Record<WeatherSound, RegExp> = {
        rain: /regen|rain|schauer|shower/i,
        wind: /wind|sturm|storm|böe|gust|blizzard/i,
        fire: /feuer|fire|flamme|flame|brand|burn|glut/i,
    };

    /**
     * Weather starting brings the ambience of the library called like it, unless the DM
     * chose one or none before
     */
    function pick_sounds(next: Weather) {
        const strength: Record<WeatherSound, number> = {
            rain: next.rain,
            wind: Math.max(Math.abs(next.wind) >= 0.3 ? 1 : 0, next.sand ?? 0),
            fire: next.ash ?? 0,
        };
        const sounds = { ...(next.sounds ?? {}) };
        let picked = false;
        for (const kind of ["rain", "wind", "fire"] as const) {
            if (strength[kind] < 0.01 || sounds[kind] !== undefined) continue;
            const found = ambience_sounds.find((sound) => SOUND_NAMES[kind].test(sound.name));
            if (!found) continue;
            sounds[kind] = found.file;
            picked = true;
        }
        if (picked) next.sounds = sounds;
    }

    /** A slider records the undo step when it is grabbed, not on every step */
    function change(update: Partial<Weather>, record = true) {
        if (!gameState.scene) return;
        if (record) record_undo();
        const next = { ...weather, ...update };
        // Lightning turned on brings the thunders of the library, those called like it
        if (next.lightning && !weather.lightning && !thunder_files(next).length) {
            next.thunders = effect_sounds
                .filter((sound) => /thunder|donner|gewitter/i.test(sound.name))
                .slice(0, 6)
                .map((sound) => sound.file);
            next.thunder = next.thunders[0] ?? null;
        }
        pick_sounds(next);
        // Here right away, for everyone once the server sends it on
        gameState.scene.weather = next;
        send(next);
    }

    /** The first stays in `thunder` too, for players whose app is older */
    function set_thunders(files: string[]) {
        change({ thunders: files, thunder: files[0] ?? null });
    }

    function set_sound(kind: WeatherSound, file: string) {
        change({ sounds: { ...(weather.sounds ?? {}), [kind]: file } });
    }

    function sound_name(file: string) {
        return (
            audioState.sounds.find((sound) => sound.file === file)?.name ??
            file.split("/").pop()!.replace(/\.[^.]+$/, "")
        );
    }

    /** How long it is between two flashes on average, in words */
    function every(rate: number | null | undefined) {
        const seconds = Math.round(60 / flashes_per_minute(rate));
        return `etwa alle ${seconds} s`;
    }

    function matches(a: Weather, b: Weather) {
        return (
            (["rain", "snow", "fog", "wind"] as const).every(
                (key) => Math.abs(a[key] - b[key]) < 0.01,
            ) &&
            (["ash", "sand"] as const).every(
                (key) => Math.abs((a[key] ?? 0) - (b[key] ?? 0)) < 0.01,
            ) &&
            a.lightning === b.lightning
        );
    }

    const SLIDERS = [
        { key: "rain", label: "Regen" },
        { key: "snow", label: "Schnee" },
        { key: "fog", label: "Nebel" },
        { key: "ash", label: "Asche", title: "Asche fällt, Glut steigt auf, ein Feuer in der Nähe" },
        { key: "sand", label: "Sand", title: "Ein Sandsturm, der Sand häuft sich an der Karte" },
    ] as const;

    const SKY = [
        { key: "aurora", label: "Polarlicht" },
        { key: "blood_moon", label: "Blutmond", title: "Ein roter Mond in einem roten Himmel" },
    ] as const;

    const SOUNDS = [
        { key: "rain", label: "Regen" },
        { key: "wind", label: "Wind" },
        { key: "fire", label: "Feuer" },
    ] as const;
</script>

{#snippet slider(
    label: string,
    title: string | undefined,
    value: number,
    set: (value: number) => void,
)}
    <label class="flex items-center gap-2 text-sm" {title}>
        <span class="w-16">{label}</span>
        <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="range range-xs flex-1"
            {value}
            onpointerdown={record_undo}
            onkeydown={record_undo}
            oninput={(event) => set(Number(event.currentTarget.value))}
        />
    </label>
{/snippet}

<section class="flex flex-col gap-2">
    <h2 class="font-bold">Wetter</h2>
    {#if gameState.scene}
        <div class="flex flex-wrap gap-1">
            {#each PRESETS as preset (preset.label)}
                <button
                    class="btn btn-xs {matches(weather, preset.weather)
                        ? 'btn-info'
                        : 'btn-soft'}"
                    onclick={() => change(preset.weather)}
                >
                    <i class="fa-solid {preset.icon}"></i>
                    {preset.label}
                </button>
            {/each}
        </div>
        {#each SLIDERS as item (item.key)}
            {@render slider(
                item.label,
                "title" in item ? item.title : undefined,
                weather[item.key] ?? 0,
                (value) => change({ [item.key]: value }, false),
            )}
        {/each}
        <label class="flex items-center gap-2 text-sm">
            <span class="w-16">Wind</span>
            <i class="fa-solid fa-arrow-left text-xs opacity-50"></i>
            <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                class="range range-xs flex-1"
                value={weather.wind}
                onpointerdown={record_undo}
                onkeydown={record_undo}
                oninput={(event) =>
                    change({ wind: Number(event.currentTarget.value) }, false)}
            />
            <i class="fa-solid fa-arrow-right text-xs opacity-50"></i>
        </label>
        <label class="flex items-center gap-2 text-sm">
            <input
                type="checkbox"
                class="toggle toggle-sm"
                checked={weather.lightning}
                onchange={(event) =>
                    change({ lightning: event.currentTarget.checked })}
            />
            Blitze
        </label>
        {#if weather.lightning}
            <label class="flex items-center gap-2 text-sm">
                <span class="w-16">Häufig</span>
                <i class="fa-solid fa-hourglass-half text-xs opacity-50" title="Selten"></i>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    class="range range-xs flex-1"
                    aria-label="Wie oft es blitzt"
                    value={weather.lightning_rate ?? 0.5}
                    onpointerdown={record_undo}
                    onkeydown={record_undo}
                    oninput={(event) =>
                        change({ lightning_rate: Number(event.currentTarget.value) }, false)}
                />
                <i class="fa-solid fa-bolt text-xs opacity-50" title="Oft"></i>
            </label>
            <span
                class="text-xs text-base-content/60 -mt-1 ml-18"
                title="Das Gewitter zieht über ein paar Minuten auf und wieder ab, dazwischen blitzt es öfter und näher"
            >
                Blitzt {every(weather.lightning_rate)}
            </span>
            <label
                class="flex items-center gap-2 text-sm"
                title="Ein naher Blitz zeigt für einen Augenblick, was die Figuren im Dunkeln nicht sehen"
            >
                <input
                    type="checkbox"
                    class="toggle toggle-sm"
                    checked={weather.lightning_reveals !== false}
                    onchange={(event) =>
                        change({ lightning_reveals: event.currentTarget.checked })}
                />
                Erhellt das Dunkel
            </label>
            <div class="flex flex-col gap-1 text-sm">
                <span
                    title="Nach jedem Blitz bei allen derselbe davon, zufällig, mal nah und laut, mal fern und leise"
                    >Donner</span
                >
                {#each thunders as file (file)}
                    <div class="flex items-center gap-2 pl-1">
                        <i class="fa-solid fa-volume-high text-xs opacity-50"></i>
                        <span class="flex-1 truncate" title={sound_name(file)}
                            >{sound_name(file)}</span
                        >
                        <button
                            class="btn btn-xs btn-ghost btn-square"
                            aria-label="{sound_name(file)} entfernen"
                            title="Entfernen"
                            onclick={() =>
                                set_thunders(thunders.filter((other) => other !== file))}
                        >
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                {/each}
                <select
                    class="select select-sm w-full"
                    value=""
                    aria-label="Donner hinzufügen"
                    onchange={(event) => {
                        const file = event.currentTarget.value;
                        event.currentTarget.value = "";
                        if (file) set_thunders([...thunders, file]);
                    }}
                >
                    <option value="">
                        {thunders.length ? "Weiteren Donner hinzufügen…" : "Donner hinzufügen…"}
                    </option>
                    {#each effect_sounds.filter((sound) => !thunders.includes(sound.file)) as sound (sound.name)}
                        <option value={sound.file}>{sound.name}</option>
                    {/each}
                </select>
            </div>
        {/if}

        <h3 class="text-sm font-semibold mt-1" title="Hinter der Karte, im Licht um sie herum">
            Himmel
        </h3>
        {#each SKY as item (item.key)}
            {@render slider(
                item.label,
                "title" in item ? item.title : undefined,
                weather[item.key] ?? 0,
                (value) => change({ [item.key]: value }, false),
            )}
        {/each}
        <label class="flex items-center gap-2 text-sm">
            <input
                type="checkbox"
                class="toggle toggle-sm"
                checked={!!weather.shooting_stars}
                onchange={(event) =>
                    change({ shooting_stars: event.currentTarget.checked })}
            />
            Sternschnuppen
        </label>

        <h3
            class="text-sm font-semibold mt-1"
            title="Ambiente, das mit dem Wetter mitläuft, so laut wie es stark ist"
        >
            Klänge
        </h3>
        {#each SOUNDS as item (item.key)}
            <label class="flex items-center gap-2 text-sm">
                <span class="w-16">{item.label}</span>
                <select
                    class="select select-sm flex-1 min-w-0"
                    value={weather.sounds?.[item.key] ?? ""}
                    onchange={(event) => set_sound(item.key, event.currentTarget.value)}
                >
                    <option value="">Keiner</option>
                    {#each ambience_sounds as sound (sound.name)}
                        <option value={sound.file}>{sound.name}</option>
                    {/each}
                </select>
            </label>
        {/each}

        <h3 class="text-sm font-semibold mt-1" title="Ein paar Sekunden lang, bei allen">
            Momente
        </h3>
        <div class="grid grid-cols-4 gap-1">
            {#each MOMENTS as moment (moment.key)}
                <button
                    class="btn btn-soft h-auto min-h-0 py-1.5 px-1 flex-col gap-0.5 font-normal"
                    title={moment.title}
                    onclick={() => send_moment(moment.key)}
                >
                    <span class="text-xl leading-none">{moment.emoji}</span>
                    <span class="text-xs">{moment.label}</span>
                </button>
            {/each}
        </div>
    {:else}
        <p class="text-sm text-base-content/60">
            Aktiviere eine Szene, dann kannst du ihr Wetter einstellen.
        </p>
    {/if}
</section>
