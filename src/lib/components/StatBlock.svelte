<script lang="ts">
    import {
        ABILITIES,
        ABILITY_SHORT,
        challenge_rating,
        modifier_string,
        type Monster,
        type MonsterFeature,
    } from "$lib/monsters";

    let { monster }: { monster: Monster } = $props();

    const SPEED_LABELS: Record<string, string> = {
        walk: "",
        fly: "Fliegen",
        swim: "Schwimmen",
        climb: "Klettern",
        burrow: "Graben",
    };

    let speed = $derived(
        Object.entries(monster.speed ?? {})
            .filter(
                ([kind, value]) =>
                    kind in SPEED_LABELS &&
                    typeof value === "number" &&
                    value > 0,
            )
            .map(([kind, value]) => `${SPEED_LABELS[kind]} ${value} ft`.trim())
            .join(", "),
    );

    const ACTION_TITLES: Record<string, string> = {
        ACTION: "Aktionen",
        BONUS_ACTION: "Bonusaktionen",
        REACTION: "Reaktionen",
        LEGENDARY_ACTION: "Legendäre Aktionen",
        LAIR_ACTION: "Hortaktionen",
    };

    let sections: [string, MonsterFeature[]][] = $derived(
        [
            ["Merkmale", monster.traits ?? []] as [string, MonsterFeature[]],
            ...Object.entries(ACTION_TITLES).map(
                ([type, title]) =>
                    [
                        title,
                        (monster.actions ?? []).filter(
                            (action) =>
                                (action.action_type ?? "ACTION") === type,
                        ),
                    ] as [string, MonsterFeature[]],
            ),
        ].filter(([, features]) => features.length > 0),
    );
</script>

<div class="flex flex-col gap-3 text-sm">
    <div>
        <h3 class="text-xl font-bold">{monster.name}</h3>
        <p class="italic text-base-content/70">
            {monster.size?.name}
            {monster.type?.name}{monster.alignment
                ? `, ${monster.alignment}`
                : ""}
        </p>
    </div>
    <div class="grid grid-cols-3 gap-1 text-center">
        <div class="bg-base-200 rounded-box p-1">
            <div class="text-xs text-base-content/60">Rüstungsklasse</div>
            <div class="font-bold text-lg">{monster.armor_class}</div>
        </div>
        <div class="bg-base-200 rounded-box p-1">
            <div class="text-xs text-base-content/60">Trefferpunkte</div>
            <div class="font-bold text-lg">
                {monster.hit_points}
                {#if monster.hit_dice}
                    <span class="text-xs font-normal">({monster.hit_dice})</span
                    >
                {/if}
            </div>
        </div>
        <div class="bg-base-200 rounded-box p-1">
            <div class="text-xs text-base-content/60">Herausforderung</div>
            <div class="font-bold text-lg">{challenge_rating(monster)}</div>
        </div>
    </div>
    {#if speed}
        <p><span class="font-bold">Bewegung</span> {speed}</p>
    {/if}
    <div class="grid grid-cols-6 gap-1 text-center">
        {#each ABILITIES as ability}
            <div class="bg-base-200 rounded-box p-1">
                <div class="text-xs text-base-content/60">
                    {ABILITY_SHORT[ability]}
                </div>
                <div class="font-bold">{monster.ability_scores?.[ability]}</div>
                <div class="text-xs">
                    {modifier_string(monster.modifiers?.[ability] ?? 0)}
                </div>
            </div>
        {/each}
    </div>
    {#if monster.languages?.as_string}
        <p>
            <span class="font-bold">Sprachen</span>
            {monster.languages.as_string}
        </p>
    {/if}
    {#each sections as [title, features]}
        <div>
            <h4 class="font-bold border-b border-base-content/20 mb-1">
                {title}
            </h4>
            {#each features as feature}
                <p class="mb-1">
                    <span class="font-bold italic">{feature.name}.</span>
                    {feature.desc}
                </p>
            {/each}
        </div>
    {/each}
    {#if monster.document}
        <p class="text-xs text-base-content/50">
            Quelle: {monster.document.display_name ?? monster.document.name} (Open5e)
        </p>
    {/if}
</div>
