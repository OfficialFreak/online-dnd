import type { 
    AbilityScore, 
    Background, 
    CharacterClass, 
    CharacterDecorations, 
    CharacterNotes, 
    Currency, 
    InventoryItem, 
    PersonalityTraits, 
    Race,
    Alignment
} from '..';

export interface CharacterData {
    // Basic Info
    id: string;
    name: string;
    decorations: CharacterDecorations;
    
    // Demographics
    gender: string;
    faith: string;
    age: number;
    hair: string;
    eyes: string;
    skin: string;
    height: string;
    weight: number;
    
    // Core Stats
    inspiration: boolean;
    baseHitPoints: number;
    bonusHitPoints: number | null;
    temporaryHitPoints: number;
    currentXp: number;
    alignmentId: Alignment;
    stats: AbilityScore[];
    
    // Character Components
    race: Race;
    background: Background;
    classes: CharacterClass[];
    
    // Equipment
    inventory: InventoryItem[];
    currencies: Currency;
    
    // Character Details
    notes: CharacterNotes;
    traits: PersonalityTraits;
}