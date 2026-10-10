// @ts-ignore
import confetti from "canvas-confetti";
import { appState } from "./state.svelte";

const blood = confetti.shapeFromText({
    text: "🔴",
});

/**
 * Splatters blood where a marker was removed. x and y are the marker's top left
 * corner and size its width, all as fractions of the map.
 */
export function spill_blood(x: number, y: number, size: number) {
    const duration = 10_00;
    const origin = {
        x: x + size / 2,
        y: y + size / 2,
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
        shapes: [blood],
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
        shapes: [blood],
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
        shapes: [blood],
    });
}
