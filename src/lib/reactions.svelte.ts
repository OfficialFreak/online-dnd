/**
 * Quick reactions like in a party game: a player calls out "Yippie!" and everyone hears
 * it, in the player's own voice if they recorded it.
 */
import { appState } from "$lib/state.svelte";
import { play_effect } from "$lib/audio.svelte";
import { DEFAULT_VOICES, play_clatter } from "$lib/sfx";
import { Reaction } from "$lib/types/messaging/client_messages";

export const REACTIONS = [
    { key: "hello", label: "Hallo", emoji: "👋", text: "Hallo!" },
    { key: "no", label: "Nein", emoji: "🙅", text: "Nein!" },
    { key: "yippie", label: "Yippie", emoji: "🥳", text: "Yippie!" },
    { key: "waah", label: "Waaah", emoji: "😱", text: "Waaah!" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

type Bubble = { id: number; emoji: string; text: string; who?: string };

export const reactionState = $state({
    /** The recordings of this player, by reaction */
    mine: {} as Record<string, string>,
    /** What was just called out, shown for a moment */
    bubbles: [] as Bubble[],
});

let next_bubble = 0;
let last_sent = 0;

export function send_reaction(key: ReactionKey) {
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
export function play_reaction(key: string, file?: string | null, who = "") {
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
}) {
    const reaction = REACTIONS.find((reaction) => reaction.key === message.reaction);
    if (!reaction) return;
    const who = message.character || message.person;
    show_bubble(reaction.emoji, reaction.text, who);
    play_reaction(reaction.key, message.file, who);
}

/** The DM rolled behind the screen: everyone hears the dice, nobody sees them */
export function hear_hidden_roll() {
    play_clatter();
    show_bubble("🎲", "Der DM würfelt verdeckt …");
}
