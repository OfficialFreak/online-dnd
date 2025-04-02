export class Character implements CharacterData {
    id: string;
    name: string;
    stats: AbilityScore[];
    // ... implement all CharacterData properties
  
    constructor(data: CharacterData) {
        this.id = data.id;
        this.name = data.name;
        this.stats = data.stats;
        // ... assign all properties
    }
  
    getProficiencyBonus(): number {
        const totalLevel = this.classes.reduce((sum, c) => sum + c.level, 0);
        return Math.floor((totalLevel - 1) / 4) + 2;
    }
  
    getAbilityModifier(abilityId: AbilityTypes): number {
        const score = this.stats.find(s => s.id === abilityId)?.value ?? 10;
        return Math.floor((score - 10) / 2);
    }
  
    getInitiative(): number {
        return this.getAbilityModifier(AbilityTypes.Dexterity);
    }
  
    getCurrentHP(): number {
        return (this.baseHitPoints + (this.bonusHitPoints ?? 0)) - this.temporaryHitPoints;
    }
  
    // Static method to create Character instance from API data
    static fromApiResponse(data: any): Character {
        // Transform API data into CharacterData format
        const characterData: CharacterData = {
            id: data.id,
            name: data.name,
            // ... transform all properties
        };
        
        return new Character(characterData);
    }
}