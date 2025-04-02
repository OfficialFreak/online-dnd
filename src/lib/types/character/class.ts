export interface ClassFeature {
    name: string;
    description: string;
    snippet?: string;
    level: number;
    limitedUse?: {
        maxUses: number;
        resetType: string; // "short" | "long" | "daily" etc
    };
}
  
export interface CharacterClass {
    id: string;
    name: string;
    level: number;
    hitDice: number;
    isStartingClass: boolean;
    hitDiceUsed: number;
    features: ClassFeature[];
}