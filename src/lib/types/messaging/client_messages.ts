import type { SceneData, SceneLight, SceneState, Weather } from "./server_messages";
import type { Door, Wall } from "$lib/vision";
import type { RollMode } from "$lib/rolls";
import type { DiceReplay } from "$lib/dice-sync";

/** What goes along with a roll so everyone sees the same dice */
type SharedRoll = { roll_id: string; replay: DiceReplay | null };
import type { MonsterInfo } from "$lib/monsters";
import type { Drawing } from "$lib/drawings";
import type { Sound } from "$lib/audio.svelte";

export class InitialMessage {
    /** web: without QUIC, live positions then come over the WebSocket */
    static create(web = false): string {
        return JSON.stringify({
            type: "initial",
            web: web,
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
    static create(dices: string, result: number, single_dice: boolean, dm_only: boolean, notation: string, mode: RollMode, d20s: number[], shared: SharedRoll): string {
        return JSON.stringify({
            ...shared,
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
    static create(stat: string, result: number, bonus: number, mode: RollMode, d20s: number[], shared: SharedRoll): string {
        return JSON.stringify({
            ...shared,
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
    static create(stat: string, result: number, bonus: number, mode: RollMode, d20s: number[], shared: SharedRoll): string {
        return JSON.stringify({
            ...shared,
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

export class InitiativeEntries {
    /** Adds or changes these entries, the server merges them into the stored list */
    static create(entries: [number, string][]): string {
        return JSON.stringify({
            type: "initiative_entries",
            entries: entries
        });
    }
}

export class SetTurn {
    /**
     * Only applies if the turn on the server is still `from`. Going `back` gives the
     * creature whose turn it is again the round of its conditions back.
     */
    static create(from: string | null, turn: string | null, round: number, back = false): string {
        return JSON.stringify({
            type: "set_turn",
            from: from,
            turn: turn,
            round: round,
            back: back
        });
    }
}

export class UpdateSceneMarker {
    /** Changes one placed marker of the active scene but not its position, a different name renames it */
    static create(old_name: string, marker: { name: string; size: number; status_effects: string[]; hidden?: boolean; hp?: number | null; max_hp?: number | null; effect_rounds?: Record<string, number> }): string {
        return JSON.stringify({
            type: "update_scene_marker",
            old_name: old_name,
            marker: {
                name: marker.name,
                size: marker.size,
                status_effects: marker.status_effects,
                hidden: !!marker.hidden,
                hp: marker.hp ?? null,
                max_hp: marker.max_hp ?? null,
                effect_rounds: marker.effect_rounds ?? {}
            }
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

/** Live positions of clients without QUIC, see live.ts */
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
    static create(x: number, y: number, marker_name: string): string {
        return JSON.stringify({
            type: "marker_position",
            marker_name: marker_name,
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

export class ListAssets {
    static create(): string {
        return JSON.stringify({
            type: "list_assets"
        });
    }
}

export class DeleteAsset {
    /** Only works for files nothing uses */
    static create(name: string): string {
        return JSON.stringify({
            type: "delete_asset",
            name: name
        });
    }
}

export class PutSound {
    static create(name: string, file: string, kind: Sound["kind"]): string {
        return JSON.stringify({
            type: "put_sound",
            name: name,
            file: file,
            kind: kind
        });
    }
}

export class ImportSound {
    /** The server downloads it from one of the sound libraries and adds it to the sounds */
    static create(url: string, name: string, kind: Sound["kind"]): string {
        return JSON.stringify({
            type: "import_sound",
            url: url,
            name: name,
            kind: kind
        });
    }
}

export class ListTabletopAudio {
    static create(): string {
        return JSON.stringify({
            type: "tabletop_audio"
        });
    }
}

export class DeleteSound {
    static create(name: string): string {
        return JSON.stringify({
            type: "delete_sound",
            name: name
        });
    }
}

export class PlaySound {
    /** Music replaces what is playing, effects play on top */
    static create(name: string): string {
        return JSON.stringify({
            type: "play_sound",
            name: name
        });
    }
}

export class StopMusic {
    static create(): string {
        return JSON.stringify({
            type: "stop_music"
        });
    }
}

/** All walls and doors of a scene, the lights and whether sight is on only if given */
export class PutWalls {
    static create(scene: string, walls: Wall[], doors: Door[], extra: { lights?: SceneLight[]; vision?: boolean } = {}): string {
        return JSON.stringify({
            type: "put_walls",
            scene: scene,
            walls: walls,
            doors: doors,
            ...extra
        });
    }
}

/** Whether players only see what their figures see, in the active scene */
export class SetVision {
    static create(enabled: boolean): string {
        return JSON.stringify({
            type: "set_vision",
            enabled: enabled
        });
    }
}

/** Opens or closes a door, the DM also locks it */
export class SetDoor {
    static create(id: string, change: { open?: boolean; locked?: boolean }): string {
        return JSON.stringify({
            type: "set_door",
            id: id,
            ...change
        });
    }
}

/** Cells the player's figures saw, they lose their fog for this player */
export class RevealFog {
    static create(cells: number[]): string {
        return JSON.stringify({
            type: "reveal_fog",
            cells: cells
        });
    }
}

/** The weather over the map of the active scene, for everyone */
export class SetWeather {
    static create(weather: Weather): string {
        return JSON.stringify({
            type: "set_weather",
            weather: weather
        });
    }
}

/** The scene no longer starts the music last played in it */
export class ForgetSceneMusic {
    static create(scene: string): string {
        return JSON.stringify({
            type: "forget_scene_music",
            name: scene
        });
    }
}

/** Cuts an effect short for everyone */
export class StopSound {
    static create(name: string): string {
        return JSON.stringify({
            type: "stop_sound",
            name: name
        });
    }
}

export class ListUsers {
    static create(): string {
        return JSON.stringify({
            type: "list_users"
        });
    }
}

export class CreateUser {
    static create(name: string, dm: boolean): string {
        return JSON.stringify({
            type: "create_user",
            name: name,
            dm: dm
        });
    }
}

export class SetDm {
    static create(name: string, dm: boolean): string {
        return JSON.stringify({
            type: "set_dm",
            name: name,
            dm: dm
        });
    }
}

export class RegenerateKey {
    /** The old key stops working right away */
    static create(name: string): string {
        return JSON.stringify({
            type: "regenerate_key",
            name: name
        });
    }
}

export class DeleteUser {
    static create(name: string): string {
        return JSON.stringify({
            type: "delete_user",
            name: name
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