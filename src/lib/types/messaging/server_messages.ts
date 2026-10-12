import type { RollMode } from "$lib/rolls";
import type { DiceReplay } from "$lib/dice-sync";
import type { MonsterInfo } from "$lib/monsters";
import type { Drawing } from "$lib/drawings";
import type { Door, Wall } from "$lib/vision";
import type { CarriedLight, Lighting, SceneLight } from "$lib/lighting";
import type { AssetInfo } from "$lib/assets";
import type { Sound } from "$lib/audio.svelte";
import type { TabletopTrack } from "$lib/sound-library";
import type { AdminUser } from "$lib/state.svelte";

// Define enums for message types and event types
export enum MessageType {
    MESSAGE = "message",
    INITIAL = "initial",
    EVENT = "event",
    ROLL_RESULT = "roll_result",
    SCENE = "scene",
    SCENE_INITIATIVE = "scene_initiative",
    SCENE_LIST = "scene_list",
    PRELOAD_RESOURCE = "preload_resource",
    TOGGLE_PRESSURE = "toggle_pressure",
    USERS = "users",
    MARKER_LOCKED = "marker_locked",
    MARKER_FREED = "marker_freed",
    UPDATE_FOG = "update_fog",
    MARKER_LIB = "marker_lib",
    MOUSE_LARGE = "mouse_large",
    CHARACTERS = "characters",
    CHECK_RESULT = "check_result",
    SAVE_RESULT = "save_result",
    COMBAT_STATE = "combat_state",
    BLOOD = "blood",
    ROLL_HISTORY = "roll_history",
    DRAWING_ADDED = "drawing_added",
    DRAWINGS_DELETED = "drawings_deleted",
    ASSET_LIST = "asset_list",
    SOUND_LIB = "sound_lib",
    PLAY_SOUND = "play_sound",
    STOP_MUSIC = "stop_music",
    STOP_SOUND = "stop_sound",
    USER_ADMIN = "user_admin",
    TABLETOP_AUDIO = "tabletop_audio",
    SOUND_IMPORT_FAILED = "sound_import_failed",
    MOUSE_POSITION = "mouse_position",
    MARKER_POSITION = "marker_position",
    WEATHER = "weather",
    EFFECTS_ENDED = "effects_ended",
    DOOR = "door",
    PONG = "pong",
    REACTION = "reaction",
    REACTIONS = "reactions"
}

export enum EventType {
    JOINED = "joined",
    LEFT = "left",
    SELF_JOIN = "self_join"
}

export interface BaseServerMessage {
    type: MessageType;
}

export interface PlayerMessage extends BaseServerMessage {
    type: MessageType.MESSAGE;
    sender: string;
    sender_dm: boolean;
    message: string;
}

export interface InitialData extends BaseServerMessage {
    type: MessageType.INITIAL;
    display_name: string;
    dm_status: boolean;
}

export interface Event extends BaseServerMessage {
    type: MessageType.EVENT;
    event_type: EventType;
}

export interface JoinEvent extends Event {
    event_type: EventType.JOINED;
    person: string;
    person_dm: boolean;
}

export interface LeaveEvent extends Event {
    event_type: EventType.LEFT;
    person: string;
}

export interface SelfJoinEvent extends Event {
    event_type: EventType.SELF_JOIN;
}

/** What every roll has, the optional fields are missing from older clients */
interface Roll extends BaseServerMessage {
    sender: string;
    sender_dm?: boolean;
    result: number;
    mode?: RollMode | null;
    /** Both d20s of a roll with advantage or disadvantage */
    d20s?: number[] | null;
    /** Milliseconds since 1970, set by the server */
    time?: number;
    roll_id?: string | null;
    /** How the dice moved, only when the roll happens, not in the history */
    replay?: DiceReplay | null;
}

export interface RollResult extends Roll {
    type: MessageType.ROLL_RESULT;
    sender_dm: boolean;
    dices: string;
    /** e.g. "2d6 + 1d20" */
    notation?: string | null;
    single_dice: boolean;
    dm_only: boolean;
}

export interface MarkerTemplate {
    name: string;
    size: number;
    file: string;
    /** Hit points of the creature, placed markers start with them */
    max_hp?: number | null;
    /** The monster from Open5e it was made from */
    monster?: MonsterInfo | null;
}

export interface Marker {
    name: string;
    x: any;
    y: any;
    size: number;
    file: string;
    status_effects: string[];
    /** Only DMs see hidden markers, players don't get them at all */
    hidden?: boolean;
    /** Hit points of creatures that aren't characters */
    hp?: number | null;
    max_hp?: number | null;
    monster?: MonsterInfo | null;
    /**
     * Rounds left of the conditions that end by themselves. The server counts them down at
     * the end of the creature's turn.
     */
    effect_rounds?: Record<string, number>;
    /** A light the creature carries */
    light?: CarriedLight | null;
    /** How far it sees in the dark in feet, instead of what its character has */
    darkvision?: number | null;
}

/** Weather over the map, each from 0 for none to 1 for the most */
export interface Weather {
    rain: number;
    snow: number;
    fog: number;
    /** From -1, blowing to the left, to 1, to the right */
    wind: number;
    lightning: boolean;
    /** The sound file everyone hears a moment after a flash */
    thunder?: string | null;
}

/** What plays when the DM switches to a scene, the music last played or stopped in it */
export type SceneMusic = { kind: "song"; name: string } | { kind: "silence" };

export interface SceneState {
    fog_squares: Record<string, Array<number>>;
    markers: Marker[];
    initiative: [number, string][];
    turn: string | null;
    /** Combat round, missing in scenes from before it existed */
    round?: number | null;
    drawings?: Drawing[];
    /** Walls and doors that block sight, in fractions of the map */
    walls?: Wall[];
    doors?: Door[];
    /** Lights on the map, older imports have a range instead of radii */
    lights?: SceneLight[];
    /** Players only see what their figures see past the walls */
    vision?: boolean;
    /** How bright the scene is without lights, bright if missing */
    lighting?: Lighting;
}

export interface InitiativeSceneData extends BaseServerMessage {
    type: MessageType.SCENE_INITIATIVE;
    initiative: [number, string][];
    turn: string | null;
    /** Null when an older client changed the initiative */
    round?: number | null;
}

export interface SceneData extends BaseServerMessage {
    type: MessageType.SCENE;
    name: string;
    map: string;
    background: string;
    background_blur: number;
    columns: number;
    rows: number;
    x_offset: number;
    y_offset: number;
    /** Missing from older servers and in scenes without any */
    weather?: Weather | null;
    state: SceneState;
}

export interface Scene {
    _id: string;
    name: string;
    map_file: string;
    background_file: string | null;
    background_blur: number;
    rows: number;
    columns: number;
    x_offset: number;
    y_offset: number;
    music?: SceneMusic | null;
    weather?: Weather | null;
}

export interface SceneList extends BaseServerMessage {
    type: MessageType.SCENE_LIST;
    scenes: Scene[];
}

export interface PreloadResource extends BaseServerMessage {
    type: MessageType.PRELOAD_RESOURCE;
    file: string;
}

export interface TogglePressure extends BaseServerMessage {
    type: MessageType.TOGGLE_PRESSURE;
    active: boolean;
}

export interface User {
    name: string;
    active: boolean;
    dm: boolean;
}

export interface Users extends BaseServerMessage {
    type: MessageType.USERS;
    users: User[];
}

export interface MarkerLocked extends BaseServerMessage {
    type: MessageType.MARKER_LOCKED;
    locked_by: string;
    marker_name: string;
}

export interface MarkerFreed extends BaseServerMessage {
    type: MessageType.MARKER_FREED;
    marker_name: string;
    /** Final position, missing when the lock is released because the dragging user left */
    x?: number;
    y?: number;
}

export interface UpdateFog extends BaseServerMessage {
    type: MessageType.UPDATE_FOG;
    fog_squares: SceneState["fog_squares"];
}

export interface MarkerLib extends BaseServerMessage {
    type: MessageType.MARKER_LIB;
    markers: MarkerTemplate[];
}

export interface MouseLarge extends BaseServerMessage {
    type: MessageType.MOUSE_LARGE;
    /** Whose pointer, missing from older servers */
    user?: string;
}

export interface Blood extends BaseServerMessage {
    type: MessageType.BLOOD;
    x: number;
    y: number;
    size: number;
}

export interface Characters extends BaseServerMessage {
    type: MessageType.CHARACTERS;
    characters: any;
}

export interface CheckResult extends Roll {
    type: MessageType.CHECK_RESULT;
    stat: string;
    bonus: number;
}

export interface SaveResult extends Roll {
    type: MessageType.SAVE_RESULT;
    stat: string;
    bonus: number;
}

export interface CombatState extends BaseServerMessage {
    type: MessageType.COMBAT_STATE;
    active: boolean;
}

export interface DrawingAdded extends BaseServerMessage {
    type: MessageType.DRAWING_ADDED;
    drawing: Drawing;
}

export interface DrawingsDeleted extends BaseServerMessage {
    type: MessageType.DRAWINGS_DELETED;
    ids: string[];
}

export interface AssetList extends BaseServerMessage {
    type: MessageType.ASSET_LIST;
    assets: AssetInfo[];
}

export interface SoundLib extends BaseServerMessage {
    type: MessageType.SOUND_LIB;
    sounds: Sound[];
}

export interface PlaySound extends BaseServerMessage {
    type: MessageType.PLAY_SOUND;
    name: string;
    file: string;
    kind: Sound["kind"];
    /** When the DM started it, in milliseconds since 1970 */
    started_at: number;
    /** When the server sent this, by its clock, newer servers only */
    sent_at?: number;
}

export interface StopMusic extends BaseServerMessage {
    type: MessageType.STOP_MUSIC;
}

export interface StopSound extends BaseServerMessage {
    type: MessageType.STOP_SOUND;
    name: string;
}

export interface WeatherChanged extends BaseServerMessage {
    type: MessageType.WEATHER;
    weather: Weather;
}

/** Someone called out a quick reaction, with their recording if they made one */
export interface ReactionMessage extends BaseServerMessage {
    type: MessageType.REACTION;
    person: string;
    character?: string | null;
    reaction: string;
    file?: string | null;
}

/** This player's recordings, by reaction */
export interface Reactions extends BaseServerMessage {
    type: MessageType.REACTIONS;
    reactions: Record<string, string>;
}

/** The answer to a ping, the connection lives */
export interface Pong extends BaseServerMessage {
    type: MessageType.PONG;
}

export interface DoorChanged extends BaseServerMessage {
    type: MessageType.DOOR;
    id: string;
    open: boolean;
    locked: boolean;
}

/** Conditions whose rounds ran out at the end of the creature's turn */
export interface EffectsEnded extends BaseServerMessage {
    type: MessageType.EFFECTS_ENDED;
    marker: string;
    effects: string[];
}

export interface UserAdmin extends BaseServerMessage {
    type: MessageType.USER_ADMIN;
    users: AdminUser[];
}

export interface TabletopAudio extends BaseServerMessage {
    type: MessageType.TABLETOP_AUDIO;
    tracks: TabletopTrack[];
}

export interface SoundImportFailed extends BaseServerMessage {
    type: MessageType.SOUND_IMPORT_FAILED;
    name: string;
}

/** Live positions, over the WebSocket only for clients without QUIC */
export interface MousePosition extends BaseServerMessage {
    type: MessageType.MOUSE_POSITION;
    user: string;
    x: number;
    y: number;
}

export interface MarkerPosition extends BaseServerMessage {
    type: MessageType.MARKER_POSITION;
    marker_name: string;
    x: number;
    y: number;
}

export type AnyRoll = RollResult | CheckResult | SaveResult;

/** The latest rolls, sent after connecting */
export interface RollHistory extends BaseServerMessage {
    type: MessageType.ROLL_HISTORY;
    rolls: AnyRoll[];
}

export type ServerMessage = 
    | PlayerMessage 
    | InitialData 
    | JoinEvent 
    | LeaveEvent 
    | SelfJoinEvent
    | RollResult 
    | SceneData 
    | InitiativeSceneData
    | SceneList 
    | PreloadResource 
    | TogglePressure 
    | Users 
    | MarkerLocked 
    | MarkerFreed 
    | UpdateFog 
    | MarkerLib 
    | MouseLarge 
    | Blood
    | Characters 
    | CheckResult 
    | SaveResult
    | CombatState
    | RollHistory
    | DrawingAdded
    | DrawingsDeleted
    | AssetList
    | SoundLib
    | PlaySound
    | StopMusic
    | StopSound
    | WeatherChanged
    | EffectsEnded
    | DoorChanged
    | Pong
    | ReactionMessage
    | Reactions
    | UserAdmin
    | TabletopAudio
    | SoundImportFailed
    | MousePosition
    | MarkerPosition;

// Parser function
export function parseServerMessage(json: string): ServerMessage {
    const data = JSON.parse(json);
    
    switch (data.type) {
        case MessageType.MESSAGE:
            return data as PlayerMessage;
        case MessageType.INITIAL:
            return data as InitialData;
        case MessageType.EVENT:
            switch (data.event_type) {
                case EventType.JOINED:
                    return data as JoinEvent;
                case EventType.LEFT:
                    return data as LeaveEvent;
                case EventType.SELF_JOIN:
                    return data as SelfJoinEvent;
                default:
                    throw new Error(`Unknown event type: ${data.event_type}`);
            }
        case MessageType.ROLL_RESULT:
            return data as RollResult;
        case MessageType.SCENE:
            return data as SceneData;
        case MessageType.SCENE_INITIATIVE:
            return data as InitiativeSceneData;
        case MessageType.SCENE_LIST:
            return data as SceneList;
        case MessageType.PRELOAD_RESOURCE:
            return data as PreloadResource;
        case MessageType.TOGGLE_PRESSURE:
            return data as TogglePressure;
        case MessageType.USERS:
            return data as Users;
        case MessageType.MARKER_LOCKED:
            return data as MarkerLocked;
        case MessageType.MARKER_FREED:
            return data as MarkerFreed;
        case MessageType.UPDATE_FOG:
            return data as UpdateFog;
        case MessageType.MARKER_LIB:
            return data as MarkerLib;
        case MessageType.MOUSE_LARGE:
            return data as MouseLarge;
        case MessageType.BLOOD:
            return data as Blood;
        case MessageType.CHARACTERS:
            return data as Characters;
        case MessageType.CHECK_RESULT:
            return data as CheckResult;
        case MessageType.SAVE_RESULT:
            return data as SaveResult;
        case MessageType.COMBAT_STATE:
            return data as CombatState;
        case MessageType.ROLL_HISTORY:
            return data as RollHistory;
        case MessageType.DRAWING_ADDED:
            return data as DrawingAdded;
        case MessageType.DRAWINGS_DELETED:
            return data as DrawingsDeleted;
        case MessageType.ASSET_LIST:
            return data as AssetList;
        case MessageType.SOUND_LIB:
            return data as SoundLib;
        case MessageType.PLAY_SOUND:
            return data as PlaySound;
        case MessageType.STOP_MUSIC:
            return data as StopMusic;
        case MessageType.STOP_SOUND:
            return data as StopSound;
        case MessageType.USER_ADMIN:
            return data as UserAdmin;
        case MessageType.TABLETOP_AUDIO:
            return data as TabletopAudio;
        case MessageType.SOUND_IMPORT_FAILED:
            return data as SoundImportFailed;
        case MessageType.MOUSE_POSITION:
            return data as MousePosition;
        case MessageType.MARKER_POSITION:
            return data as MarkerPosition;
        case MessageType.WEATHER:
            return data as WeatherChanged;
        case MessageType.EFFECTS_ENDED:
            return data as EffectsEnded;
        case MessageType.DOOR:
            return data as DoorChanged;
        case MessageType.PONG:
            return data as Pong;
        case MessageType.REACTION:
            return data as ReactionMessage;
        case MessageType.REACTIONS:
            return data as Reactions;
        default:
            throw new Error(`Unknown message type: ${data.type}`);
    }
}