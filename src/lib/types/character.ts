export class Character {
    /** The D&D Beyond id */
    id!: number;
    name!: string;
    gender!: string;
    player_name!: string;
    baseHitPoints!: number;
    bonusHitPoints!: number | null;
    overrideHitPoints!: number | null;
    temporaryHitPoints!: number;
    removedHitPoints!: number;
    stats: any;
    bonusStats: any;
    overrideStats: any;
    classes: any;
    race: any;
    modifiers: any;
    inventory: any;
    conditions: any;
    customSenses: any;

    constructor(data: any) {
        Object.assign(this, data);
    }

    get baseStats() {
        let base_stats = {
            strength: this.stats[0].value,
            dexterity: this.stats[1].value,
            constitution: this.stats[2].value,
            intelligence: this.stats[3].value,
            wisdom: this.stats[4].value,
            charisma: this.stats[5].value,
        };
        return base_stats;
    }

    /**
     * The modifiers in effect, from the race, class, background, feats and items. D&D Beyond
     * lists an item's modifiers whether it is worn or not, so they come from the inventory.
     */
    get allModifiers(): any[] {
        const modifiers = Object.entries(this.modifiers ?? {}).flatMap(
            ([origin, modifiers]: [string, any]) =>
                origin === "item" ? [] : (modifiers ?? []),
        );
        for (const item of this.inventory ?? []) {
            const definition = item.definition;
            // Like D&D Beyond: worn if it can be, attuned if it needs it, never a potion or scroll
            if (
                definition.isConsumable ||
                (definition.canEquip && !item.equipped) ||
                (definition.canAttune && !item.isAttuned)
            ) {
                continue;
            }
            modifiers.push(...(definition.grantedModifiers ?? []));
        }
        return modifiers;
    }

    /** What a modifier adds, a bonus type of 1 adds the proficiency bonus (Alert, Harengon) */
    modifierValue(modifier: any): number {
        return (
            (modifier.value ?? 0) +
            (modifier.bonusTypes?.includes(1) ? this.proficiencyBonus : 0)
        );
    }

    /** The sum of the "bonus" modifiers of a sub type, like "armor-class" */
    bonus(subType: string): number {
        return this.allModifiers
            .filter(
                (modifier) =>
                    modifier.type === "bonus" && modifier.subType === subType,
            )
            .reduce((sum, modifier) => sum + this.modifierValue(modifier), 0);
    }

    hasModifier(type: string, subType: string): boolean {
        return this.allModifiers.some(
            (modifier) =>
                modifier.type === type && modifier.subType === subType,
        );
    }

    get actualStats() {
        let stats: Record<string, number> = { ...this.baseStats };

        Object.keys(stats).forEach((stat, index) => {
            stats[stat] +=
                (this.bonusStats?.[index]?.value ?? 0) +
                this.bonus(`${stat}-score`);
        });
        // Items like a Belt of Giant Strength set a score, unless it is higher already
        for (const modifier of this.allModifiers) {
            const stat = modifier.subType?.replace(/-score$/, "");
            if (
                modifier.type === "set" &&
                modifier.subType === `${stat}-score` &&
                stat in stats
            ) {
                stats[stat] = Math.max(stats[stat], modifier.value ?? 0);
            }
        }
        // Scores entered by hand on D&D Beyond replace everything else
        Object.keys(stats).forEach((stat, index) => {
            stats[stat] = this.overrideStats?.[index]?.value || stats[stat];
        });

        return stats;
    }

    get statModifiers() {
        const stats = this.actualStats;
        return {
            strength: Math.floor((stats.strength - 10) / 2),
            dexterity: Math.floor((stats.dexterity - 10) / 2),
            constitution: Math.floor((stats.constitution - 10) / 2),
            intelligence: Math.floor((stats.intelligence - 10) / 2),
            wisdom: Math.floor((stats.wisdom - 10) / 2),
            charisma: Math.floor((stats.charisma - 10) / 2),
        };
    }

    get savingModifiers() {
        let stats: Record<string, number> = { ...this.statModifiers };

        // A Cloak of Protection adds to every save, other bonuses to one
        const all_saves = this.bonus("saving-throws");
        for (const stat of Object.keys(stats)) {
            if (this.hasModifier("proficiency", `${stat}-saving-throws`)) {
                stats[stat] += this.proficiencyBonus;
            }
            stats[stat] += all_saves + this.bonus(`${stat}-saving-throws`);
        }

        return stats;
    }

    /** The proficiency bonus a check with the skill adds: twice with expertise, half by Jack of All Trades */
    skillProficiency(skill: string): number {
        if (this.hasModifier("expertise", skill)) {
            return 2 * this.proficiencyBonus;
        }
        if (this.hasModifier("proficiency", skill)) {
            return this.proficiencyBonus;
        }
        if (
            this.hasModifier("half-proficiency", skill) ||
            this.hasModifier("half-proficiency", "ability-checks")
        ) {
            return Math.floor(this.proficiencyBonus / 2);
        }
        return 0;
    }

    get passiveSenses() {
        const modifiers = this.statModifiers;
        return {
            perception:
                10 +
                modifiers.wisdom +
                this.skillProficiency("perception") +
                this.bonus("passive-perception"),
            investigation:
                10 +
                modifiers.intelligence +
                this.skillProficiency("investigation") +
                this.bonus("passive-investigation"),
            insight:
                10 +
                modifiers.wisdom +
                this.skillProficiency("insight") +
                this.bonus("passive-insight"),
        };
    }

    get specialSenses() {
        const idNameMap = {
            1: "blindsight",
            2: "darkvision",
            3: "tremorsense",
            4: "truesight",
        };

        let stats = {};

        // Set base
        for (const [modifier_origin, modifiers] of Object.entries(
            this.modifiers,
        )) {
            for (const modifier of modifiers as any) {
                if (modifier.type === "set-base") {
                    try {
                        if (
                            Object.values(idNameMap).includes(modifier.subType)
                        ) {
                            // @ts-ignore
                            stats[modifier.subType] = modifier.fixedValue;
                        }
                    } catch {}
                }
            }
        }

        // Apply Overrides / Custom Senses
        for (const modifier of this.customSenses) {
            if (modifier.distance) {
                // @ts-ignore
                stats[idNameMap[modifier.senseId]] = modifier.distance;
            }
        }

        return stats;
    }

    /** Like on D&D Beyond without the temporary hit points, they are shown on their own */
    get maxHealth(): number {
        if (this.overrideHitPoints) return this.overrideHitPoints;
        return (
            this.baseHitPoints +
            (this.bonusHitPoints ?? 0) +
            // Tough or a Hill Dwarf add hit points per level
            (this.statModifiers.constitution +
                this.bonus("hit-points-per-level")) *
                this.level
        );
    }

    get currentHealth(): number {
        return this.maxHealth - this.removedHitPoints;
    }

    get level(): number {
        return Math.min(
            this.classes.reduce(
                (acc: any, c_class: any) => acc + c_class.level,
                0,
            ),
            20,
        );
    }

    get formattedGender(): string {
        // Left out like on D&D Beyond when the player didn't enter one
        if (!this.gender) {
            return "";
        }
        let lowered = this.gender.toLowerCase();
        if (["m", "male"].includes(lowered)) {
            return "Male";
        } else if (["f", "female"].includes(lowered)) {
            return "Female";
        } else {
            return this.gender;
        }
    }

    get detailedDescription(): string {
        return [
            this.formattedGender,
            this.race.fullName,
            this.classes
                .map(
                    (c_class: any) =>
                        `${c_class.definition.name} ${c_class.level}`,
                )
                .join(", "),
        ]
            .filter(Boolean)
            .join(" ");
    }

    get armorClass(): number {
        const modifiers = this.statModifiers;
        let armor: number | undefined;
        let shield = 0;

        for (const item of this.inventory ?? []) {
            const definition = item.definition;
            if (!item.equipped || !definition.armorClass) continue;
            switch (definition.armorTypeId) {
                case 1: // Light armor
                    armor = definition.armorClass + modifiers.dexterity;
                    break;
                case 2: // Medium armor
                    armor =
                        definition.armorClass +
                        Math.min(modifiers.dexterity, 2);
                    break;
                case 3: // Heavy armor
                    armor = definition.armorClass;
                    break;
                case 4: // Shield
                    shield += definition.armorClass;
                    break;
            }
        }

        let armor_class: number;
        if (armor !== undefined) {
            // Like the Defense fighting style
            armor_class = armor + this.bonus("armored-armor-class");
        } else {
            // Unarmored Defense adds Constitution for barbarians, Wisdom for monks, Draconic
            // Resilience a fixed 3, the best of them counts. Its statId is 1 for Strength.
            const unarmored_defense = this.allModifiers
                .filter(
                    (modifier) =>
                        modifier.type === "set" &&
                        modifier.subType === "unarmored-armor-class",
                )
                .map(
                    (modifier) =>
                        (modifier.statId
                            ? Object.values(modifiers)[modifier.statId - 1]
                            : 0) + (modifier.value ?? 0),
                );
            armor_class =
                10 +
                modifiers.dexterity +
                Math.max(0, ...unarmored_defense) +
                // Like Bracers of Defense
                this.bonus("unarmored-armor-class");
        }

        // Magic armor, shields and rings, the bonuses come from the worn items' modifiers
        armor_class += shield + this.bonus("armor-class");

        // The artificer's Enhanced Defense infusion, taken to be on the worn armor
        const artificer = this.classes.find(
            (c_class: any) => c_class.definition.name === "Artificer",
        );
        if (artificer && artificer.level >= 2 && armor !== undefined) {
            armor_class += artificer.level >= 10 ? 2 : 1;
        }

        return armor_class;
    }

    get actualInitiative(): number {
        // Alert and the Harengon's Hare-Trigger add the proficiency bonus as a bonus,
        // Jack of All Trades half of it
        return (
            this.statModifiers.dexterity +
            this.bonus("initiative") +
            (this.hasModifier("half-proficiency", "initiative")
                ? Math.floor(this.proficiencyBonus / 2)
                : 0)
        );
    }

    get proficiencyBonus(): number {
        return Math.floor((this.level - 1) / 4) + 2;
    }

    get activeStatusEffects(): string[] {
        // D&D Beyond's condition ids, starting at 1
        let id_effect_map = [
            "blinded",
            "charmed",
            "deafened",
            "exhaustion",
            "frightened",
            "grappled",
            "incapacitated",
            "invisible",
            "paralyzed",
            "petrified",
            "poisoned",
            "prone",
            "restrained",
            "stunned",
            "unconscious",
        ];
        return this.conditions.map(
            (condition: any) => id_effect_map[condition.id - 1],
        );
    }
}
