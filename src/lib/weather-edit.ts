/**
 * The DM changes the active scene's weather, from the weather controls and from the
 * sounds playing now: here right away, for everyone once the server sends it on.
 */
import throttle from "just-throttle";
import { appState, gameState, record_undo } from "$lib/state.svelte";
import { SetWeather } from "$lib/types/messaging/client_messages";
import type { Weather, WeatherSound } from "$lib/types/messaging/server_messages";
import { CLEAR } from "$lib/weather";

// Dragging a slider sends a few times a second, not on every step
const send = throttle(
    (weather: Weather) => appState.ws?.send(SetWeather.create(weather)),
    150,
    { trailing: true },
);

/** The active scene's weather, every amount filled in */
export function scene_weather(): Weather {
    return { ...CLEAR, ...(gameState.scene?.weather ?? {}) };
}

/**
 * The weather from now on. A slider records the undo step when it is grabbed, so while
 * it moves without `record`.
 */
export function set_scene_weather(next: Weather, record = true) {
    if (!gameState.scene) return;
    if (record) record_undo();
    gameState.scene.weather = next;
    send(next);
}

/** How loud the ambience going with `kind` plays relative to the others, from 0 to 1 */
export function set_weather_sound_level(kind: WeatherSound, level: number, record = false) {
    const weather = scene_weather();
    set_scene_weather({ ...weather, sound_levels: { ...(weather.sound_levels ?? {}), [kind]: level } }, record);
}
