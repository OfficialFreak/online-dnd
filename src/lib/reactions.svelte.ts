/**
 * Quick reactions like in a party game: a player calls out "Yippie!" and everyone hears
 * it, in the player's own voice if they recorded it.
 */
import { appState } from "$lib/state.svelte";
import { play_effect } from "$lib/audio.svelte";
import { DEFAULT_VOICES, play_clatter } from "$lib/sfx";
import { Reaction } from "$lib/types/messaging/client_messages";
import type { Voiceline } from "$lib/types/messaging/server_messages";

export const REACTIONS = [
    { key: "hello", label: "Hallo", emoji: "👋", text: "Hallo!" },
    { key: "no", label: "Nein", emoji: "🙅", text: "Nein!" },
    { key: "yippie", label: "Yippie", emoji: "🥳", text: "Yippie!" },
    { key: "waah", label: "Waaah", emoji: "😱", text: "Waaah!" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

/** A line of the player's own is called out by this and its id */
export const VOICELINE = "voice:";
/** The bubble of a line of the player's own */
const VOICELINE_EMOJI = "🗣️";

type Bubble = { id: number; emoji: string; text: string; who?: string };

export const reactionState = $state({
    /** The recordings of this player, by reaction */
    mine: {} as Record<string, string>,
    /** The lines this player recorded and named, as many as they like */
    voicelines: [] as Voiceline[],
    /** What was just called out, shown for a moment */
    bubbles: [] as Bubble[],
});

let next_bubble = 0;
let last_sent = 0;

/** A standard reaction, or a line of the player's own as VOICELINE and its id */
export function send_reaction(key: string) {
    // The server drops quicker ones anyway
    if (Date.now() - last_sent < 900) return;
    last_sent = Date.now();
    appState.ws?.send(Reaction.create(key));
}

function show_bubble(emoji: string, text: string, who?: string) {
    const id = ++next_bubble;
    reactionState.bubbles = [...reactionState.bubbles, { id, emoji, text, who }].slice(-5);
    setTimeout(() => {
        reactionState.bubbles = reactionState.bubbles.filter((bubble) => bubble.id !== id);
    }, 3000);
}

/** Plays a reaction like the others hear it, the recording or the cartoon voice */
export function play_reaction(key: string, file?: string | null, who = "", label?: string | null) {
    if (key.startsWith(VOICELINE)) {
        if (file) play_effect(`${who}: ${label ?? key}`.trim(), file);
        return;
    }
    const reaction = REACTIONS.find((reaction) => reaction.key === key);
    if (!reaction) return;
    if (file) play_effect(`${who}: ${reaction.label}`.trim(), file);
    else DEFAULT_VOICES[key]?.();
}

export function hear_reaction(message: {
    person: string;
    character?: string | null;
    reaction: string;
    file?: string | null;
    label?: string | null;
}) {
    const who = message.character || message.person;
    if (message.reaction.startsWith(VOICELINE)) {
        show_bubble(VOICELINE_EMOJI, message.label ?? "…", who);
        play_reaction(message.reaction, message.file, who, message.label);
        return;
    }
    const reaction = REACTIONS.find((reaction) => reaction.key === message.reaction);
    if (!reaction) return;
    show_bubble(reaction.emoji, reaction.text, who);
    play_reaction(reaction.key, message.file, who);
}

/** The DM rolled behind the screen: everyone hears the dice, nobody sees them */
export function hear_hidden_roll() {
    play_clatter();
    show_bubble("🎲", "Der DM würfelt verdeckt …");
}
