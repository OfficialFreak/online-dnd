export interface BaseServerMessage {
    type: string
}

export interface PlayerMessage extends BaseServerMessage {
    "type": "message",
    "sender": string,
    "sender_dm": boolean,
    "message": string
}

export interface InitialData extends BaseServerMessage {
    "type": "initial",
    "display_name": string,
    "dm_status": boolean
}

export interface Event extends BaseServerMessage {
    "type": "event",
    "event_type": string
}

export interface JoinEvent extends Event {
    "event_type": "joined",
    "person": string
}

export interface LeaveEvent extends Event {
    "event_type": "left",
    "person": string
}

export interface RollResult extends BaseServerMessage {
    "type": "roll_result",
    "sender": string,
    "sender_dm": boolean
    "dices": string,
    "result": number,
    "single_dice": boolean,
    "dm_only": boolean,
}

export interface Marker {
    name: string,
    x: any,
    y: any,
    size: number,
    file: string,
    status_effects: string[]
}

export interface SceneState {
    fog_squares: Record<string, [number, number][]>,
    markers: Marker[]
}

export interface SceneData extends BaseServerMessage {
    "type": "scene",
    "name": string,
    "map": string,
    "background": string,
    "background_blur": number,
    "columns": number,
    "x_offset": number,
    "y_offset": number,
    "state": SceneState,
}

export interface Scene {
    _id: string,
    name: string,
    map_file: string,
    columns: number,
    x_offset: number,
    y_offset: number,
}

export interface SceneList extends BaseServerMessage {
    "type": "scene_list",
    "scenes": Scene[]
}

export interface PreloadResource extends BaseServerMessage {
    "type": "preload_resource",
    "file": string
}

export interface TogglePressure extends BaseServerMessage {
    "type": "toggle_pressure",
    "active": boolean
}

export interface User {
    "name": string,
    "active": boolean
}

export interface Users extends BaseServerMessage {
    "type": "users",
    "users": User[]
}

export interface MousePosition extends BaseServerMessage {
    "type": "mouse_position",
    "user": string,
    "x": number,
    "y": number
}

export interface MarkerPosition extends BaseServerMessage {
    "type": "marker_position",
    "marker_name": string,
    "x": number,
    "y": number
}

export interface MarkerLocked extends BaseServerMessage {
    "type": "marker_locked",
    "locked_by": string,
    "marker_name": string
}

export interface MarkerFreed extends BaseServerMessage {
    "type": "marker_freed",
    "marker_name": string
}

export type ServerMessage = PlayerMessage | InitialData | JoinEvent | LeaveEvent | RollResult | SceneData | SceneList | PreloadResource | TogglePressure | Users | MousePosition | MarkerPosition | MarkerLocked | MarkerFreed

// Parser function
export function parseServerMessage(json: string): ServerMessage {
    const data = JSON.parse(json);
    
    switch (data.type) {
        case "message":
            return data as PlayerMessage;
        case "initial":
            return data as InitialData;
        case "event":
            switch (data.event_type) {
                case 'joined':
                    return data as JoinEvent;
                case 'left':
                    return data as LeaveEvent;
                default:
                    throw new Error(`Unknown event type: ${data.event_type}`);
            }
        case "roll_result":
            return data as RollResult;
        case "scene":
            return data as SceneData;
        case "scene_list":
            return data as SceneList;
        case "preload_resource":
            return data as PreloadResource;
        case "toggle_pressure":
            return data as TogglePressure;
        case "users":
            return data as Users;
        case "mouse_position":
            return data as MousePosition;
        case "marker_position":
            return data as MarkerPosition;
        case "marker_locked":
            return data as MarkerLocked;
        case "marker_freed":
            return data as MarkerFreed;
        default:
            throw new Error(`Unknown message type: ${data.type}`);
    }
}