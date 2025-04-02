export enum AbilityType {
    Strength = 1,
    Dexterity = 2,
    Constitution = 3,
    Intelligence = 4,
    Wisdom = 5,
    Charisma = 6
}

export interface AbilityScore {
    type: AbilityType;
    value: number;
}