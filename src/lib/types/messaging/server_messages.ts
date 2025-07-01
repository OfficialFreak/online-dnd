// Define enums for message types and event types
export enum MessageType {
    MESSAGE = "message",
    INITIAL = "initial",
    EVENT = "event",
    ROLL_RESULT = "roll_result",
    SCENE = "scene",
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
    COMBAT_STATE = "combat_state"
}

export enum EventType {
    JOINED = "joined",
    LEFT = "left"
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

export interface RollResult extends BaseServerMessage {
    type: MessageType.ROLL_RESULT;
    sender: string;
    sender_dm: boolean;
    dices: string;
    result: number;
    single_dice: boolean;
    dm_only: boolean;
}

export interface MarkerTemplate {
    name: string;
    size: number;
    file: string;
}

export interface Marker {
    name: string;
    x: any;
    y: any;
    size: number;
    file: string;
    status_effects: string[];
}

export interface SceneState {
    fog_squares: Record<string, [number, number][]>;
    markers: Marker[];
    initiative: [number, string][];
    turn: string | null;
}

export interface SceneData extends BaseServerMessage {
    type: MessageType.SCENE;
    name: string;
    map: string;
    background: string;
    background_blur: number;
    columns: number;
    x_offset: number;
    y_offset: number;
    state: SceneState;
}

export interface Scene {
    _id: string;
    name: string;
    map_file: string;
    columns: number;
    x_offset: number;
    y_offset: number;
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
}

export interface UpdateFog extends BaseServerMessage {
    type: MessageType.UPDATE_FOG;
    fog_squares: Record<string, [number, number][]>;
}

export interface MarkerLib extends BaseServerMessage {
    type: MessageType.MARKER_LIB;
    markers: MarkerTemplate[];
}

export interface MouseLarge extends BaseServerMessage {
    type: MessageType.MOUSE_LARGE;
}

export interface Characters extends BaseServerMessage {
    type: MessageType.CHARACTERS;
    characters: any;
}

export interface CheckResult extends BaseServerMessage {
    type: MessageType.CHECK_RESULT;
    sender: string;
    stat: string;
    result: number;
    bonus: number;
}

export interface SaveResult extends BaseServerMessage {
    type: MessageType.SAVE_RESULT;
    sender: string;
    stat: string;
    result: number;
    bonus: number;
}

export interface CombatState extends BaseServerMessage {
    type: MessageType.COMBAT_STATE;
    active: boolean;
}

export type ServerMessage = 
    | PlayerMessage 
    | InitialData 
    | JoinEvent 
    | LeaveEvent 
    | RollResult 
    | SceneData 
    | SceneList 
    | PreloadResource 
    | TogglePressure 
    | Users 
    | MarkerLocked 
    | MarkerFreed 
    | UpdateFog 
    | MarkerLib 
    | MouseLarge 
    | Characters 
    | CheckResult 
    | SaveResult
    | CombatState;

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
                default:
                    throw new Error(`Unknown event type: ${data.event_type}`);
            }
        case MessageType.ROLL_RESULT:
            return data as RollResult;
        case MessageType.SCENE:
            return data as SceneData;
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
        case MessageType.CHARACTERS:
            return data as Characters;
        case MessageType.CHECK_RESULT:
            return data as CheckResult;
        case MessageType.SAVE_RESULT:
            return data as SaveResult;
        case MessageType.COMBAT_STATE:
            return data as CombatState;
        default:
            throw new Error(`Unknown message type: ${data.type}`);
    }
}