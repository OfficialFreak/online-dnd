import type { SceneData, SceneState } from "./server_messages";
import type { RollMode } from "$lib/rolls";
import type { MonsterInfo } from "$lib/monsters";
import type { Drawing } from "$lib/drawings";

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
    static create(dices: string, result: number, single_dice: boolean, dm_only: boolean, notation: string, mode: RollMode, d20s: number[]): string {
        return JSON.stringify({
            type: "roll_result",
            dices: dices,
            result: result,
            single_dice: single_dice,
            dm_only: dm_only,
            notation: notation,
            mode: mode,
            d20s: d20s
        });
    }
}

export class CheckResult {
    /** result is the d20 that counts, without the bonus */
    static create(stat: string, result: number, bonus: number, mode: RollMode, d20s: number[]): string {
        return JSON.stringify({
            type: "check_result",
            stat: stat,
            result: result,
            bonus: bonus,
            mode: mode,
            d20s: d20s
        });
    }
}

export class SaveResult {
    /** result is the d20 that counts, without the bonus */
    static create(stat: string, result: number, bonus: number, mode: RollMode, d20s: number[]): string {
        return JSON.stringify({
            type: "save_result",
            stat: stat,
            result: result,
            bonus: bonus,
            mode: mode,
            d20s: d20s
        });
    }
}

export class PutScene {
    static create(name: string, map_file: string, background_file: string | null, background_blur: number, columns: number, rows: number, x_offset: number, y_offset: number, state: SceneState): string {
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
    static update_initiative(initiative: [number, string][], turn: string | null, round: number) {
        return JSON.stringify({
            type: "scene_initiative",
            initiative: initiative,
            turn: turn,
            round: round
        });
    }
}

export class UpdateScene {
    /** Changes everything but the scene's state, a different name renames it */
    static create(old_name: string, name: string, map_file: string, background_file: string | null, background_blur: number, columns: number, rows: number, x_offset: number, y_offset: number): string {
        return JSON.stringify({
            type: "update_scene",
            old_name: old_name,
            name: name,
            map_file: map_file,
            background_file: background_file,
            background_blur: background_blur,
            columns: columns,
            rows: rows,
            x_offset: x_offset,
            y_offset: y_offset
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

export class Blood {
    /** x and y are the removed marker's top left corner, size its width, all as fractions of the map */
    static create(x: number, y: number, size: number): string {
        return JSON.stringify({
            type: "blood",
            x: x,
            y: y,
            size: size
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
    static create(name: string, file: string, size: number, max_hp: number | null = null, monster: MonsterInfo | null = null): string {
        return JSON.stringify({
            type: "put_marker",
            name: name,
            file: file,
            size: size,
            max_hp: max_hp,
            monster: monster
        });
    }
}

export class UpdateMarker {
    /** A different name renames the marker */
    static create(old_name: string, name: string, file: string, size: number, max_hp: number | null, monster: MonsterInfo | null): string {
        return JSON.stringify({
            type: "update_marker",
            old_name: old_name,
            name: name,
            file: file,
            size: size,
            max_hp: max_hp,
            monster: monster
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

export class DeleteCharacter {
    /** id is the character's D&D Beyond id */
    static create(id: number): string {
        return JSON.stringify({
            type: "delete_character",
            id: id
        });
    }
}

export class AddDrawing {
    static create(drawing: Drawing): string {
        return JSON.stringify({
            type: "add_drawing",
            drawing: drawing
        });
    }
}

export class DeleteDrawings {
    /** The drawings with these ids, or all of an owner, or all drawings of the scene (DM only) */
    static create(filter: { ids?: string[]; owner?: string }): string {
        return JSON.stringify({
            type: "delete_drawings",
            ids: filter.ids ?? null,
            owner: filter.owner ?? null
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