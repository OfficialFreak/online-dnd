import type { SceneData, SceneState } from "./server_messages";

export class InitialMessage {
    static create(): string {
        return JSON.stringify({
            type: "initial",
        });
    }
}

export class PlayerMessage {
    static create(msg: string, recipient: string): string {
        return JSON.stringify({
            type: "message",
            "msg": msg,
            "recipient": recipient
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

export class CheckResult {
    static create(stat: string, result: number, bonus: number): string {
        return JSON.stringify({
            type: "check_result",
            stat: stat,
            result: result,
            bonus: bonus
        });
    }
}

export class SaveResult {
    static create(stat: string, result: number, bonus: number): string {
        return JSON.stringify({
            type: "save_result",
            stat: stat,
            result: result,
            bonus: bonus
        });
    }
}

export class PutScene {
    static create(name: string, map_file: string, background_file: string, background_blur: number, columns: number, rows: number, x_offset: number, y_offset: number, state: SceneState): string {
        return JSON.stringify({
            type: "put_scene",
            name: name,
            map_file: map_file,
            background_file: background_file,
            background_blur: background_blur,
            columns: columns,
            rows: rows,
            x_offset: x_offset,
            y_offset: y_offset,
            state: state
        });
    }
    static update(scene: SceneData): string {
        let new_markers = scene.state.markers.map((marker) => {
            return {
                ...marker,
                x: marker.x.target,
                y: marker.y.target
            };
        })
        
        return JSON.stringify({
            type: "put_scene",
            name: scene.name,
            map_file: scene.map,
            background_file: scene.background,
            background_blur: scene.background_blur,
            columns: scene.columns,
            rows: scene.rows,
            x_offset: scene.x_offset,
            y_offset: scene.y_offset,
            state: {...scene.state, markers: new_markers}
        });
    }
    static update_fog(fog_squares: SceneState["fog_squares"]): string {
        return JSON.stringify({
            type: "update_fog",
            fog_squares: fog_squares
        });
    }
    static update_initiative(initiative: [number, string][], turn: string | null) {
        return JSON.stringify({
            type: "scene_initiative",
            initiative: initiative,
            turn: turn
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

export class DeleteMarker {
    static create(name: string): string {
        return JSON.stringify({
            type: "delete_marker",
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

export class MouseLarge {
    static create(): string {
        return JSON.stringify({
            type: "mouse_large",
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

export class PutMarker {
    static create(name: string, file: string, size: number): string {
        return JSON.stringify({
            type: "put_marker",
            name: name,
            file: file,
            size: size
        });
    }
}

export class ImportCharacter {
    static create(character_url: string, selected_player: string): string {
        return JSON.stringify({
            type: "import_character",
            character_url: character_url,
            selected_player: selected_player
        });
    }
}

export class CombatState {
    static create(active: boolean): string {
        return JSON.stringify({
            type: "combat_state",
            active: active
        });
    }
}