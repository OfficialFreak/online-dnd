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

    constructor(data: any) {
        Object.assign(this, data);
    }

    get baseStats() {
        let base_stats = {
            "strength": this.stats[0].value,
            "dexterity": this.stats[1].value,
            "constitution": this.stats[2].value,
            "intelligence": this.stats[3].value,
            "wisdom": this.stats[4].value,
            "charisma": this.stats[5].value,
        };
        return base_stats;
    }

    get actualStats() {
        let stats = {
            "strength": this.baseStats.strength,
            "dexterity": this.baseStats.dexterity,
            "constitution": this.baseStats.constitution,
            "intelligence": this.baseStats.intelligence,
            "wisdom": this.baseStats.wisdom,
            "charisma": this.baseStats.charisma,
        };


        for (const [modifier_origin, modifiers] of Object.entries(this.modifiers)) {
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
            "strength": Math.floor((this.actualStats.strength - 10) / 2),
            "dexterity": Math.floor((this.actualStats.dexterity - 10) / 2),
            "constitution": Math.floor((this.actualStats.constitution - 10) / 2),
            "intelligence": Math.floor((this.actualStats.intelligence - 10) / 2),
            "wisdom": Math.floor((this.actualStats.wisdom - 10) / 2),
            "charisma": Math.floor((this.actualStats.charisma - 10) / 2),
        }
    }

    get maxHealth(): number {
        return this.baseHitPoints + this.temporaryHitPoints + this.statModifiers.constitution
    }

    get currentHealth(): number {
        return this.maxHealth - this.removedHitPoints
    }

    get level(): number {
        return this.classes.reduce((acc: any, c_class: any) => acc + c_class.level, 0);
    }
    
    get detailedDescription(): string {
        return `${this.gender || "Non-Binary"} ${this.race.fullName} ${this.classes.map((c_class: any) => `${c_class.definition.name} ${c_class.level}`).join(', ')}`
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
                        console.log(item);
                        armor_class += this.statModifiers.dexterity + item.definition.armorClass
                        break;
                    case 2:
                        console.log(item);
                        armor_class += Math.min(this.statModifiers.dexterity, 2) + item.definition.armorClass
                        break;
                    case 3:
                        console.log(item);
                        armor_class += item.definition.armorClass
                        break;

                }
            }
        }
        if (armor_class > 0) {
            return armor_class
        }
        // Modifier für Rüstungsklasse (10 + dex + stärke) <- muss ich noch beachten unter feat
        // Wenn ich keine Rüstung anhabe: 10 + dex
        let base_armor = 10 + this.statModifiers.dexterity;
        let unarmored_defense = this.modifiers.class.find((modifier: any) => modifier.modifierTypeId === 9);
        if (unarmored_defense) {
            base_armor += Object.values(this.statModifiers)[unarmored_defense.statId - 1];
        }
        return base_armor;
    }

    get actualInitiative(): number {
        let base_initiative = this.statModifiers.dexterity;

        return base_initiative;
    }
}