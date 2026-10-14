/**
 * What the DM can let happen for a few seconds over everyone's map, from the weather in
 * the sound panel or the reactions: blood rain for a natural 20 on a rat, gold rain for
 * a treasure, a thunderclap right when the door opens, a quake as the dragon lands.
 */
import { audioState } from "$lib/audio.svelte";
import { appState, gameState } from "$lib/state.svelte";
import { WeatherMoment } from "$lib/types/messaging/client_messages";
import type { WeatherMomentKind } from "$lib/types/messaging/server_messages";
import { thunder_files } from "$lib/weather";

export const MOMENTS: { key: WeatherMomentKind; label: string; emoji: string; title: string }[] = [
    { key: "blood", label: "Blutregen", emoji: "🩸", title: "Ein paar Sekunden Blutregen" },
    { key: "gold", label: "Goldregen", emoji: "🪙", title: "Münzen regnen auf die Karte" },
    { key: "thunder", label: "Donner", emoji: "⚡", title: "Ein Blitz direkt über euch, jetzt" },
    { key: "quake", label: "Beben", emoji: "🪨", title: "Die Karte bebt, Staub und Steinchen bröckeln" },
];

let last_sent = 0;

/** For everyone at once, the same on every screen */
export function send_moment(moment: WeatherMomentKind) {
    if (Date.now() - last_sent < 400) return;
    last_sent = Date.now();
    let file: string | null = null;
    if (moment === "thunder") {
        // One of the scene's thunders, else one of the library called like it
        const files = thunder_files(gameState.scene?.weather);
        file = files.length
            ? files[Math.floor(Math.random() * files.length)]
            : (audioState.sounds.find(
                  (sound) => sound.kind === "effect" && /donner|thunder|gewitter|blitz/i.test(sound.name),
              )?.file ?? null);
    }
    appState.ws?.send(WeatherMoment.create(moment, Math.floor(Math.random() * 2 ** 31), file));
}
