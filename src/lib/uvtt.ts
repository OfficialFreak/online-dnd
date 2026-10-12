/**
 * Maps from Dungeon Alchemist, Dungeondraft and others in the Universal VTT format
 * (.dd2vtt, .uvtt, .df2vtt): JSON with the map as a base64 image, and walls, doors and
 * lights measured in grid squares. https://arkenforge.com/universal-vtt-files/
 * An animated map comes as a video besides it, the format has no room for one.
 */
import type { Door, Point, Wall } from "$lib/vision";
import {
    hex_colour,
    lighting_of_colour,
    type Lighting,
    type SceneLight,
} from "$lib/lighting";
import { appState, gameState } from "$lib/state.svelte";
import { PutScene, PutWalls } from "$lib/types/messaging/client_messages";
import { MessageTypes, notify } from "$lib/notifications.svelte";
import { choose_files, file_stem_of, upload_bytes } from "$lib/upload.svelte";

export type ImportedMap = {
    image: Uint8Array;
    extension: "png" | "webp" | "jpg";
    columns: number;
    rows: number;
    walls: Wall[];
    doors: Door[];
    lights: SceneLight[];
    lighting: Lighting;
};

/** A field whatever its case: Dungeondraft writes "resolution", the format "Resolution" */
function field(object: any, name: string): any {
    if (!object || typeof object !== "object") return undefined;
    if (name in object) return object[name];
    const key = Object.keys(object).find(
        (key) => key.toLowerCase() === name.toLowerCase(),
    );
    return key === undefined ? undefined : object[key];
}

function list(value: any): any[] {
    return Array.isArray(value) ? value : [];
}

function decode_base64(text: string) {
    const binary = atob(text.replace(/^data:[^,]*,/, "").replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function image_type(bytes: Uint8Array): ImportedMap["extension"] {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
    return "webp";
}

export function parse_uvtt(text: string): ImportedMap {
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("Die Datei ist kein Universal-VTT-Export");
    }
    const resolution = field(data, "resolution");
    const size = field(resolution, "map_size");
    const width = Number(field(size, "x"));
    const height = Number(field(size, "y"));
    if (!(width > 0 && height > 0)) {
        throw new Error("In der Datei fehlt die Größe der Karte");
    }
    const origin = field(resolution, "map_origin");
    const origin_x = Number(field(origin, "x")) || 0;
    const origin_y = Number(field(origin, "y")) || 0;

    // Fractions of the map, rounded so the scene stays small
    const round = (value: number) => Math.round(value * 1e5) / 1e5;
    const point = (p: any): Point => [
        round((Number(field(p, "x")) - origin_x) / width),
        round((Number(field(p, "y")) - origin_y) / height),
    ];
    const valid = ([x, y]: Point) => Number.isFinite(x) && Number.isFinite(y);

    const walls: Wall[] = [];
    // Walls, and things like pillars that block sight too
    for (const key of ["line_of_sight", "objects_line_of_sight"]) {
        for (const line of list(field(data, key))) {
            const points = list(line)
                .map(point)
                .filter(valid)
                .filter(
                    (p, i, all) =>
                        i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1],
                );
            if (points.length >= 2) {
                walls.push({ id: `w${walls.length.toString(36)}`, points });
            }
        }
    }

    // Closed portals are the doors. The open ones are windows, archways and openings of
    // up to 14 squares in Dungeon Alchemist's maps: gaps to see through, no doors.
    const doors: Door[] = [];
    for (const portal of list(field(data, "portals"))) {
        if (field(portal, "closed") === false) continue;
        const bounds = list(field(portal, "bounds"));
        if (bounds.length < 2) continue;
        const a = point(bounds[0]);
        const b = point(bounds[bounds.length - 1]);
        if (!valid(a) || !valid(b)) continue;
        doors.push({
            id: `d${doors.length.toString(36)}`,
            a,
            b,
            open: false,
            locked: false,
        });
    }

    // Ranges in squares of five feet, bright light reaching half as far like Foundry has it
    const lights: SceneLight[] = list(field(data, "lights"))
        .map((light, index) => {
            const [x, y] = point(field(light, "position"));
            const range = (Number(field(light, "range")) || 0) * 5;
            return {
                id: `l${index.toString(36)}`,
                x,
                y,
                bright: range / 2,
                dim: range,
                color: hex_colour(field(light, "color")) ?? undefined,
                on: true,
            };
        })
        .filter((light) => valid([light.x, light.y]) && light.dim > 0);

    const image = field(data, "image");
    if (typeof image !== "string" || !image) {
        throw new Error("Die Datei enthält kein Kartenbild");
    }
    const bytes = decode_base64(image);
    return {
        image: bytes,
        extension: image_type(bytes),
        columns: Math.round(width),
        rows: Math.round(height),
        walls,
        doors,
        lights,
        lighting: lighting_of_colour(
            field(field(data, "environment"), "ambient_light"),
        ),
    };
}

/** PNG maps get a lot smaller as WebP, for everyone loading them */
async function smaller_image(map: ImportedMap) {
    if (map.extension !== "png") return { bytes: map.image, extension: map.extension };
    try {
        const bitmap = await createImageBitmap(
            new Blob([map.image as BlobPart], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/webp", 0.9),
        );
        // Safari can't write WebP and gives a PNG
        if (blob && blob.type === "image/webp" && blob.size < map.image.length) {
            return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: "webp" };
        }
    } catch (e) {
        console.warn("Converting the map to WebP failed, it stays a PNG", e);
    }
    return { bytes: map.image, extension: map.extension };
}

function unique_scene_name(name: string) {
    const taken = new Set(gameState.scenes.map((scene) => scene.name));
    if (!taken.has(name)) return name;
    let number = 2;
    while (taken.has(`${name} ${number}`)) number++;
    return `${name} ${number}`;
}

const MAP_EXTENSIONS = ["dd2vtt", "uvtt", "df2vtt", "json"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "m4v", "mov", "mkv"];

function extension_of(name: string) {
    return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Width by height of a video, null if the browser can't read it */
function video_aspect(file: File) {
    return new Promise<number | null>((resolve) => {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        const done = (aspect: number | null) => {
            URL.revokeObjectURL(url);
            resolve(aspect);
        };
        video.preload = "metadata";
        video.muted = true;
        video.addEventListener("loadedmetadata", () =>
            done(video.videoHeight ? video.videoWidth / video.videoHeight : null),
        );
        video.addEventListener("error", () => done(null));
        video.src = url;
    });
}

/**
 * Lets the DM pick an exported map and makes a scene of it: the image, its grid, walls,
 * doors and lights, with sight on. With the video of an animated map picked as well, the
 * video becomes the map.
 */
export async function import_uvtt() {
    if (!appState.ws) return;
    const files = await choose_files(
        [...MAP_EXTENSIONS, ...VIDEO_EXTENSIONS].map((extension) => `.${extension}`).join(","),
    );
    if (!files.length) return;
    const export_file = files.find((file) => MAP_EXTENSIONS.includes(extension_of(file.name)));
    const video = files.find(
        (file) =>
            file.type.startsWith("video/") || VIDEO_EXTENSIONS.includes(extension_of(file.name)),
    );
    if (!export_file) {
        notify(
            "Wähle die .dd2vtt-Datei, bei animierten Karten zusammen mit dem Video.",
            MessageTypes.Error,
            8000,
        );
        return;
    }
    let map: ImportedMap;
    try {
        map = parse_uvtt(await export_file.text());
    } catch (e) {
        notify(
            `Import fehlgeschlagen: ${e instanceof Error ? e.message : e}`,
            MessageTypes.Error,
            8000,
        );
        return;
    }

    const name = unique_scene_name(file_stem_of(export_file.name) || "Importierte Karte");
    let asset: string | null;
    if (video) {
        // Walls and lights are parts of the map, they only fit a video of the same shape
        const aspect = await video_aspect(video);
        if (aspect && Math.abs(aspect / (map.columns / map.rows) - 1) > 0.02) {
            notify(
                "Das Video ist anders geschnitten als die Karte, Wände und Lichter können daneben liegen.",
                MessageTypes.Warning,
                10000,
            );
        }
        notify("Das Video der Karte wird hochgeladen…", MessageTypes.Info, 3000);
        asset = await upload_bytes(video, `${name}.${extension_of(video.name)}`);
    } else {
        notify("Die Karte wird hochgeladen…", MessageTypes.Info, 3000);
        const { bytes, extension } = await smaller_image(map);
        asset = await upload_bytes(bytes, `${name}.${extension}`);
    }
    if (!asset || !appState.ws) return;

    // Without fog, the DM lays it with the fog tool where wanted
    await appState.ws.send(
        PutScene.create(name, asset, null, 0, map.columns, map.rows, 0, 0, {
            fog_squares: {},
            markers: [],
            initiative: [],
            turn: null,
        }),
    );
    await appState.ws.send(
        PutWalls.create(name, map.walls, map.doors, {
            lights: map.lights,
            vision: true,
            lighting: map.lighting,
        }),
    );
    notify(
        `${name} importiert${video ? " mit Video" : ""}: ${map.walls.length} Wände, ${map.doors.length} Türen, ${map.lights.length} Lichter`,
        MessageTypes.Success,
        6000,
    );
}
