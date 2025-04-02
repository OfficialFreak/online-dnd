export interface Currency {
    cp: number;
    sp: number;
    gp: number;
    ep: number;
    pp: number;
}

export interface InventoryItem {
    id: string;
    name: string;
    description: string;
    snippet?: string;
    quantity: number;
    weight: number;
    cost: number;
    equipped: boolean;
    isAttuned: boolean;
    properties?: string[];
    damage?: {
        diceCount: number;
        diceValue: number;
        type: string;
    };
}