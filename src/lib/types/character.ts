export class Character {
    name!: string;
    gender!: string;
    player_name!: string;
    baseHitPoints!: number;
    temporaryHitPoints!: number;
    removedHitPoints!: number;
    stats: any;
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

    get actualStats() {
        let stats = {
            strength: this.baseStats.strength,
            dexterity: this.baseStats.dexterity,
            constitution: this.baseStats.constitution,
            intelligence: this.baseStats.intelligence,
            wisdom: this.baseStats.wisdom,
            charisma: this.baseStats.charisma,
        };

        for (const [modifier_origin, modifiers] of Object.entries(
            this.modifiers,
        )) {
            for (const modifier of modifiers as any) {
                if (modifier.type === "bonus") {
                    try {
                        let stat = modifier.subType.split("-")[0];
                        if (Object.keys(stats).includes(stat)) {
                            // @ts-ignore
                            stats[stat] += modifier.value;
                        }
                    } catch {}
                }
            }
        }

        return stats;
    }

    get statModifiers() {
        return {
            strength: Math.floor((this.actualStats.strength - 10) / 2),
            dexterity: Math.floor((this.actualStats.dexterity - 10) / 2),
            constitution: Math.floor((this.actualStats.constitution - 10) / 2),
            intelligence: Math.floor((this.actualStats.intelligence - 10) / 2),
            wisdom: Math.floor((this.actualStats.wisdom - 10) / 2),
            charisma: Math.floor((this.actualStats.charisma - 10) / 2),
        };
    }

    get savingModifiers() {
        let stats = {
            strength: this.statModifiers.strength,
            dexterity: this.statModifiers.dexterity,
            constitution: this.statModifiers.constitution,
            intelligence: this.statModifiers.intelligence,
            wisdom: this.statModifiers.wisdom,
            charisma: this.statModifiers.charisma,
        };

        for (const [modifier_origin, modifiers] of Object.entries(
            this.modifiers,
        )) {
            for (const modifier of modifiers as any) {
                let split = modifier.subType.split("-");
                if (
                    modifier.type === "proficiency" &&
                    split[1] === "saving" &&
                    split[2] === "throws"
                ) {
                    try {
                        let stat = split[0];
                        if (Object.keys(stats).includes(stat)) {
                            // @ts-ignore
                            stats[stat] += this.proficiencyBonus;
                        }
                    } catch {}
                }
            }
        }

        return stats;
    }

    get passiveSenses() {
        let stats = {
            perception: 10 + this.statModifiers.wisdom,
            investigation: 10 + this.statModifiers.intelligence,
            insight: 10 + this.statModifiers.wisdom,
        };

        for (const [modifier_origin, modifiers] of Object.entries(
            this.modifiers,
        )) {
            for (const modifier of modifiers as any) {
                if (modifier.type === "proficiency") {
                    try {
                        if (Object.keys(stats).includes(modifier.subType)) {
                            // @ts-ignore
                            stats[modifier.subType] += this.proficiencyBonus;
                        }
                    } catch {}
                }
            }
        }

        return stats;
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

    get maxHealth(): number {
        return (
            this.baseHitPoints +
            this.temporaryHitPoints +
            this.statModifiers.constitution * this.level
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
        if (!this.gender) {
            return "Non-Binary";
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
        return `${this.formattedGender} ${this.race.fullName} ${this.classes.map((c_class: any) => `${c_class.definition.name} ${c_class.level}`).join(", ")}`;
    }

    get armorClass(): number {
        // item.equiped
        // item.definition.armorClass
        // item.definition.armorTypeId (1 is light, 2 is medium, 3 is heavy)
        let armor_class = 0;
        for (const item of this.inventory) {
            if (item.equipped && item.definition.armorClass) {
                switch (item.definition.armorTypeId) {
                    case 1:
                        armor_class +=
                            this.statModifiers.dexterity +
                            item.definition.armorClass;
                        break;
                    case 2:
                        armor_class +=
                            Math.min(this.statModifiers.dexterity, 2) +
                            item.definition.armorClass;
                        break;
                    case 3:
                        armor_class += item.definition.armorClass;
                        break;
                }
            }
        }
        if (armor_class > 0) {
            return armor_class;
        }
        // Modifier für Rüstungsklasse (10 + dex + stärke) <- muss ich noch beachten unter feat
        // Wenn ich keine Rüstung anhabe: 10 + dex
        let base_armor = 10 + this.statModifiers.dexterity;
        let unarmored_defense = this.modifiers.class.find(
            (modifier: any) => modifier.modifierTypeId === 9,
        );
        if (unarmored_defense) {
            base_armor += Object.values(this.statModifiers)[
                unarmored_defense.statId - 1
            ];
        }
        return base_armor;
    }

    get actualInitiative(): number {
        let proficiency_bonus = this.modifiers.feat.some(
            (modifier: any) => modifier.componentId === 1789101,
        )
            ? this.proficiencyBonus
            : 0;
        let base_initiative = this.statModifiers.dexterity + proficiency_bonus;

        return base_initiative;
    }

    get proficiencyBonus(): number {
        return Math.floor((this.level - 1) / 4) + 2;
    }

    get activeStatusEffects(): string[] {
        let id_effect_map = [
            "blinded",
            "charmed",
            "deafened",
            "invisible",
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
