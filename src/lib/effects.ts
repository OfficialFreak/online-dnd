// @ts-ignore
import confetti from "canvas-confetti";
import { appState, gameState } from "./state.svelte";

/** Circles instead of the 🔴 emoji, Safari drew emoji confetti with white around them */
const BLOOD = {
    shapes: ["circle"],
    colors: ["#b00020", "#8a0018", "#d1102e"],
};

/**
 * Splatters blood where a marker was removed. x and y are the marker's top left
 * corner and size its width, all as fractions of the map.
 */
export function spill_blood(x: number, y: number, size: number) {
    const duration = 10_00;
    // The size is a fraction of the width, cells are square
    const scene = gameState.scene;
    const height = scene?.rows ? (size * scene.columns) / scene.rows : size;
    const origin = {
        x: x + size / 2,
        y: y + height / 2,
    };
    appState.map_confetti_function({
        particleCount: 3,
        angle: 90,
        spread: 360,
        scalar: 20 * size,
        startVelocity: 0,
        ticks: duration + 230,
        origin,
        gravity: 0,
        decay: 0.7,
        flat: true,
        ...BLOOD,
    });
    appState.map_confetti_function({
        particleCount: 100,
        angle: 90,
        spread: 360,
        scalar: 10 * size,
        startVelocity: 50 * size,
        ticks: duration + 200,
        origin,
        gravity: 0,
        decay: 0.7,
        flat: true,
        ...BLOOD,
    });
    appState.map_confetti_function({
        particleCount: 30,
        angle: 90,
        spread: 360,
        scalar: 5 * size,
        startVelocity: 80 * size,
        ticks: duration + 100,
        origin,
        gravity: 0,
        decay: 0.7,
        flat: true,
        ...BLOOD,
    });
}
