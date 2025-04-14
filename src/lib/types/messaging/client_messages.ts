import type { SceneData, SceneState } from "./server_messages";

export class InitialMessage {
    static create(): string {
        return JSON.stringify({
            type: "initial",
        });
    }
}

export class PlayerMessage {
    static create(msg: string): string {
        return JSON.stringify({
            type: "message",
            "msg": msg
        });
    }
}

export class RollResult {
    static create(dices: string, result: number, single_dice: boolean, dm_only: boolean): string {
        return JSON.stringify({
            type: "roll_result",
            dices: dices,
            result: result,
            single_dice: single_dice,
            dm_only: dm_only
        });
    }
}

export class PutScene {
    static create(name: string, map_file: string, background_file: string, background_blur: number, columns: number, x_offset: number, y_offset: number, state: SceneState): string {
        return JSON.stringify({
            type: "put_scene",
            name: name,
            map_file: map_file,
            background_file: background_file,
            background_blur: background_blur,
            columns: columns,
            x_offset: x_offset,
            y_offset: y_offset,
            state: state
        });
    }
    static update(scene: SceneData): string {
        let scene_state = scene.state;
        scene_state.markers.forEach((marker) => {
            marker.x = marker.x.target;
            marker.y = marker.y.target;
        });
        return JSON.stringify({
            type: "put_scene",
            name: scene.name,
            map_file: scene.map,
            background_file: scene.background,
            background_blur: scene.background_blur,
            columns: scene.columns,
            x_offset: scene.x_offset,
            y_offset: scene.y_offset,
            state: scene.state
        });
    }
}

export class ActivateScene {
    static create(name: string): string {
        return JSON.stringify({
            type: "activate_scene",
            name: name
        });
    }
}

export class DeleteScene {
    static create(name: string): string {
        return JSON.stringify({
            type: "delete_scene",
            name: name
        });
    }
}

export class PreloadResource {
    static create(file: string): string {
        return JSON.stringify({
            type: "preload_resource",
            file: file
        });
    }
}

export class TogglePressure {
    static create(active: boolean): string {
        return JSON.stringify({
            type: "toggle_pressure",
            active: active
        });
    }
}

export class MousePosition {
    static create(x: number, y: number): string {
        return JSON.stringify({
            type: "mouse_position",
            x: x,
            y: y
        });
    }
}

export class MarkerPosition {
    static create(marker_name: string, x: number, y: number): string {
        return JSON.stringify({
            type: "marker_position",
            marker_name: marker_name,
            x: x,
            y: y,
        });
    }
}

export class MarkerLocked {
    static create(marker_name: string): string {
        return JSON.stringify({
            type: "marker_locked",
            marker_name: marker_name
        });
    }
}

export class MarkerFreed {
    static create(marker_name: string, x: number, y: number): string {
        return JSON.stringify({
            type: "marker_freed",
            marker_name: marker_name,
            x: x,
            y: y
        });
    }
}