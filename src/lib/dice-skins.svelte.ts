import { appState, ensureStore } from "./state.svelte";

/** Looks for the dice, in static/assets/themes. Some of them can be colored. */
export const DICE_THEMES: {
    theme: string;
    label: string;
    colorable: boolean;
}[] = [
    { theme: "default", label: "Klassisch", colorable: true },
    { theme: "smooth", label: "Glatt", colorable: true },
    { theme: "gemstone", label: "Edelstein", colorable: true },
    { theme: "rock", label: "Stein", colorable: true },
    { theme: "rust", label: "Rost", colorable: true },
    { theme: "wooden", label: "Holz", colorable: false },
    { theme: "blueGreenMetal", label: "Altes Metall", colorable: false },
    { theme: "gemstoneMarble", label: "Regenbogenmarmor", colorable: false },
    { theme: "diceOfRolling", label: "Dice of Rolling", colorable: false },
];

export const DICE_COLORS = [
    "#aa55aa",
    "#7c3aed",
    "#2563eb",
    "#0d9488",
    "#16a34a",
    "#ca8a04",
    "#ea580c",
    "#b91c1c",
    "#e5e7eb",
    "#1f2937",
];

/** This player's dice, everyone sees them when they roll */
export const diceSkin = $state({ theme: "default", color: DICE_COLORS[0] });

/** Options for dice-box to throw dice in the chosen look */
export function dice_look() {
    const theme = DICE_THEMES.find((entry) => entry.theme === diceSkin.theme);
    return {
        theme: theme?.theme ?? "default",
        themeColor: diceSkin.color,
    };
}

export async function set_dice_skin(change: Partial<typeof diceSkin>) {
    Object.assign(diceSkin, change);
    await ensureStore();
    await appState.store.set("dice_skin", { ...diceSkin });
    await appState.store.save();
}

export async function load_dice_skin() {
    await ensureStore();
    const saved = await appState.store.get("dice_skin");
    if (saved) Object.assign(diceSkin, saved);
}
