import { appState, ensureStore } from "./state.svelte";

/** Looks for the dice, in static/assets/themes. Some of them can be colored. */
export type DiceTheme = {
    theme: string;
    label: string;
    colorable: boolean;
    /** Texture for previews: one for colorable themes with numbers in "light" and "dark" */
    texture: string | { light: string; dark: string };
};

const colored = (light: string, dark: string) => ({ light, dark });

export const DICE_THEMES: DiceTheme[] = [
    {
        theme: "default",
        label: "Klassisch",
        colorable: true,
        texture: colored("diffuse-light.png", "diffuse-dark.png"),
    },
    {
        theme: "smooth",
        label: "Glatt",
        colorable: true,
        texture: colored("diffuse-light.png", "diffuse-dark.png"),
    },
    {
        theme: "gemstone",
        label: "Edelstein",
        colorable: true,
        texture: colored("gemstone-light.png", "gemstone-dark.png"),
    },
    {
        theme: "rock",
        label: "Stein",
        colorable: true,
        texture: colored("diffuse-light.png", "diffuse-dark.png"),
    },
    {
        theme: "rust",
        label: "Rost",
        colorable: true,
        texture: colored("diffuse-light.png", "diffuse-dark.png"),
    },
    {
        theme: "wooden",
        label: "Holz",
        colorable: false,
        texture: "diffuse.jpg",
    },
    {
        theme: "blueGreenMetal",
        label: "Altes Metall",
        colorable: false,
        texture: "diffuse.jpg",
    },
    {
        theme: "gemstoneMarble",
        label: "Regenbogenmarmor",
        colorable: false,
        texture: "diffuse.jpg",
    },
    {
        theme: "diceOfRolling",
        label: "Dice of Rolling",
        colorable: false,
        texture: "diffuse.jpg",
    },
];

/** Like dice-box: light dice get dark numbers */
function is_light(color: string) {
    const value = parseInt(color.replace("#", ""), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return r * 0.299 + g * 0.587 + b * 0.114 > 175;
}

/** CSS that shows a theme's texture, in the color if it can be colored */
export function theme_preview(entry: DiceTheme, color: string) {
    const file =
        typeof entry.texture === "string"
            ? entry.texture
            : entry.texture[is_light(color) ? "dark" : "light"];
    const background = entry.colorable ? color : "#2a2a2a";
    return `background-color: ${background}; background-image: url("/assets/themes/${entry.theme}/${file}");`;
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
