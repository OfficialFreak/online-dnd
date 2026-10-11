import { appState, ensureStore } from "./state.svelte";

/**
 * Looks for the dice, in static/dice/themes. Only some of them take a color, the
 * textures of the others have their own colors.
 */
export type DiceTheme = {
    theme: string;
    label: string;
    colorable: boolean;
};

export const DICE_THEMES: DiceTheme[] = [
    // The app's own purple dice, its texture covers any color
    { theme: "default", label: "Galaxie", colorable: false },
    // The plain dice of dice-box
    { theme: "classic", label: "Klassisch", colorable: true },
    { theme: "smooth", label: "Glatt", colorable: true },
    { theme: "gemstone", label: "Edelstein", colorable: true },
    { theme: "rock", label: "Stein", colorable: true },
    { theme: "rust", label: "Rost", colorable: true },
    { theme: "wooden", label: "Holz", colorable: false },
    { theme: "blueGreenMetal", label: "Altes Metall", colorable: false },
    // The soft hyphen lets the long name break in the small tile
    { theme: "gemstoneMarble", label: "Regenbogen­marmor", colorable: false },
    { theme: "diceOfRolling", label: "Dice of Rolling", colorable: false },
];

function rgb(color: string) {
    const value = parseInt(color.replace("#", ""), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The preset color closest to a picked one */
function nearest_color(color: string) {
    const [r, g, b] = rgb(color);
    return DICE_COLORS.reduce((best, preset) => {
        const distance = (other: string) => {
            const [r2, g2, b2] = rgb(other);
            return (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
        };
        return distance(preset) < distance(best) ? preset : best;
    });
}

/**
 * A rendered d20 of the theme. Colorable ones were rendered in every preset color, a
 * picked color shows the closest of them.
 */
export function theme_preview(entry: DiceTheme, color: string) {
    const suffix = entry.colorable ? `-${nearest_color(color).slice(1)}` : "";
    return `/dice/themes/${entry.theme}/preview${suffix}.webp`;
}

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
