export interface CharacterNotes {
    allies: string | null;
    personalPossessions: string | null;
    otherHoldings: string | null;
    organizations: string | null;
    enemies: string | null;
    backstory: string | null;
    otherNotes: string | null;
}
  
export interface PersonalityTraits {
    personalityTraits: string;
    ideals: string;
    bonds: string;
    flaws: string;
    appearance: string | null;
}