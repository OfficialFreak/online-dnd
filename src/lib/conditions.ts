/** How the particles of a condition move around a marker, see ConditionEffects.svelte */
export type ParticleMotion =
    | "rise"
    | "fall"
    | "orbit"
    | "pop"
    | "flash"
    | "bob";

export type Condition = {
    label: string;
    /** Ring around the marker */
    color: string;
    /** CSS filter on the marker's image */
    filter?: string;
    /** CSS animations of the marker, keyframes are in app.css */
    animation?: string;
    /** The marker lies on its side */
    prone?: boolean;
    particles?: { symbols: string[]; motion: ParticleMotion };
    /** Image over the marker */
    overlay?: string;
    /** Dark veil over the marker that comes and goes */
    veil?: boolean;
    /** Glow behind the marker */
    aura?: boolean;
    /** Font Awesome icon where D&D Beyond has none, see StatusIcon.svelte */
    icon?: string;
};

export const CONDITIONS: Record<string, Condition> = {
    blinded: {
        label: "Blind",
        color: "#2b2b2b",
        filter: "brightness(0.6)",
        veil: true,
    },
    charmed: {
        label: "Bezaubert",
        color: "#ff5fa2",
        filter: "saturate(1.4)",
        particles: { symbols: ["💗", "💕", "💗"], motion: "rise" },
    },
    deafened: {
        label: "Taub",
        color: "#8a8a8a",
        particles: { symbols: ["🔇"], motion: "bob" },
    },
    exhaustion: {
        label: "Erschöpft",
        color: "#7a6a4f",
        filter: "saturate(0.5)",
        animation: "cond-droop 3s ease-in-out infinite",
        particles: { symbols: ["💦", "💦"], motion: "fall" },
        icon: "fa-battery-quarter",
    },
    frightened: {
        label: "Verängstigt",
        color: "#6b4fa0",
        filter: "saturate(0.6) brightness(1.1)",
        animation: "cond-tremble 0.25s linear infinite",
        particles: { symbols: ["❗"], motion: "pop" },
    },
    grappled: {
        label: "Gepackt",
        color: "#b07a3a",
        animation: "cond-squeeze 1.2s ease-in-out infinite",
        particles: { symbols: ["✊"], motion: "bob" },
    },
    incapacitated: {
        label: "Kampfunfähig",
        color: "#666666",
        filter: "grayscale(0.6)",
        particles: { symbols: ["💫", "💫"], motion: "orbit" },
    },
    invisible: {
        label: "Unsichtbar",
        color: "#cccccc44",
        animation: "cond-shimmer 2.5s ease-in-out infinite",
    },
    paralyzed: {
        label: "Gelähmt",
        color: "#3fa7ff",
        filter: "saturate(0.3) brightness(1.2)",
        animation: "cond-jitter 1.8s linear infinite",
        particles: { symbols: ["⚡", "⚡"], motion: "flash" },
    },
    petrified: {
        label: "Versteinert",
        color: "gray",
        filter: "grayscale(1) contrast(1.2)",
    },
    poisoned: {
        label: "Vergiftet",
        color: "#36d903",
        filter: "sepia(0.4) hue-rotate(50deg) saturate(1.5)",
        animation: "cond-nausea 2.4s ease-in-out infinite",
        particles: { symbols: ["🫧", "🫧", "🫧"], motion: "rise" },
    },
    prone: {
        label: "Liegend",
        color: "#a0522d",
        prone: true,
    },
    restrained: {
        label: "Festgesetzt",
        color: "#8b5a2b",
        animation: "cond-squeeze 2s ease-in-out infinite",
        particles: { symbols: ["⛓️"], motion: "bob" },
    },
    stunned: {
        label: "Betäubt",
        color: "#ffd000",
        animation: "cond-wobble 1.6s ease-in-out infinite",
        particles: { symbols: ["⭐", "✨", "⭐"], motion: "orbit" },
    },
    unconscious: {
        label: "Bewusstlos",
        color: "#8e3a38",
        filter: "grayscale(0.8)",
        prone: true,
        particles: { symbols: ["💤"], motion: "rise" },
    },
    burning: {
        label: "Brennend",
        color: "#ff4300",
        filter: "brightness(1.5) sepia(1) hue-rotate(333deg) saturate(3)",
        overlay: "burning.gif",
        particles: { symbols: ["🔥", "🔥"], motion: "rise" },
        icon: "fa-fire",
    },
    bleeding: {
        label: "Blutend",
        color: "#b00020",
        particles: { symbols: ["🩸", "🩸"], motion: "fall" },
        icon: "fa-droplet",
    },
    concentration: {
        label: "Konzentration",
        color: "#7c5cff",
        aura: true,
        icon: "fa-brain",
    },
    glowing: {
        label: "Leuchtend",
        color: "#ffd75e",
        filter: "brightness(1.2) saturate(1.15)",
        aura: true,
        particles: { symbols: ["✨", "✨"], motion: "orbit" },
        icon: "fa-sun",
    },
};

/** Sorted by their German name, for picking them */
export const CONDITION_KEYS = Object.keys(CONDITIONS).toSorted((a, b) =>
    CONDITIONS[a].label.localeCompare(CONDITIONS[b].label),
);

/** Markers saved before the 5e conditions were added use "knocked" for unconscious */
export function normalize_condition(effect: string) {
    return effect === "knocked" ? "unconscious" : effect;
}

export function condition_label(effect: string) {
    return CONDITIONS[normalize_condition(effect)]?.label ?? effect;
}
