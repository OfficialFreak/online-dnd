/** Freehand lines and the spell areas of 5e: sphere, cone, line and cube */
export type DrawingKind = "free" | "circle" | "cone" | "line" | "square";

/** Positions are fractions of the map: x of its width, y of its height */
export type Drawing = {
    id: string;
    /** Set by the server */
    owner?: string;
    kind: DrawingKind;
    color: string;
    /** Where it starts: the center of a circle, the tip of a cone or line, a corner of a square */
    x: number;
    y: number;
    /** Where it was dragged to */
    x2: number;
    y2: number;
    /** The line of a freehand drawing */
    points?: [number, number][];
};

export const DRAWING_KINDS: {
    kind: DrawingKind;
    label: string;
    icon: string;
}[] = [
    { kind: "free", label: "Freihand", icon: "fa-pencil" },
    { kind: "circle", label: "Kreis", icon: "fa-regular fa-circle" },
    { kind: "cone", label: "Kegel", icon: "fa-play fa-rotate-180" },
    { kind: "line", label: "Linie", icon: "fa-grip-lines" },
    { kind: "square", label: "Würfel", icon: "fa-regular fa-square" },
];

export const DRAWING_COLORS = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#a855f7",
    "#ffffff",
    "#111111",
];

type Point = [number, number];

export type Shape =
    | { type: "polyline"; points: Point[] }
    | { type: "circle"; cx: number; cy: number; r: number }
    | { type: "polygon"; points: Point[] };

/** A drawing in pixels of a map of w × h with grid cells of `cell` pixels */
export function drawing_shape(
    drawing: Drawing,
    w: number,
    h: number,
    cell: number,
): { shape: Shape; label: { x: number; y: number; text: string } | null } {
    if (drawing.kind === "free") {
        return {
            shape: {
                type: "polyline",
                points: (drawing.points ?? []).map(([x, y]) => [x * w, y * h]),
            },
            label: null,
        };
    }

    const ax = drawing.x * w;
    const ay = drawing.y * h;
    const dx = drawing.x2 * w - ax;
    const dy = drawing.y2 * h - ay;
    const length = Math.hypot(dx, dy) || 1;
    // Along the drawing and across it
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const feet = (pixels: number) => `${Math.round((pixels / cell) * 5)} ft`;

    switch (drawing.kind) {
        case "circle":
            return {
                shape: { type: "circle", cx: ax, cy: ay, r: length },
                label: { x: ax, y: ay, text: feet(length) },
            };
        case "cone": {
            // A 5e cone is as wide as it is long
            const cx = ax + ux * length;
            const cy = ay + uy * length;
            return {
                shape: {
                    type: "polygon",
                    points: [
                        [ax, ay],
                        [cx + (nx * length) / 2, cy + (ny * length) / 2],
                        [cx - (nx * length) / 2, cy - (ny * length) / 2],
                    ],
                },
                label: {
                    x: ax + ux * length * 0.66,
                    y: ay + uy * length * 0.66,
                    text: feet(length),
                },
            };
        }
        case "line": {
            // 5 ft wide
            const half = cell / 2;
            const bx = ax + dx;
            const by = ay + dy;
            return {
                shape: {
                    type: "polygon",
                    points: [
                        [ax + nx * half, ay + ny * half],
                        [bx + nx * half, by + ny * half],
                        [bx - nx * half, by - ny * half],
                        [ax - nx * half, ay - ny * half],
                    ],
                },
                label: { x: ax + dx / 2, y: ay + dy / 2, text: feet(length) },
            };
        }
        case "square": {
            const side = Math.max(Math.abs(dx), Math.abs(dy));
            const sx = Math.sign(dx) || 1;
            const sy = Math.sign(dy) || 1;
            return {
                shape: {
                    type: "polygon",
                    points: [
                        [ax, ay],
                        [ax + side * sx, ay],
                        [ax + side * sx, ay + side * sy],
                        [ax, ay + side * sy],
                    ],
                },
                label: {
                    x: ax + (side * sx) / 2,
                    y: ay + (side * sy) / 2,
                    text: feet(side),
                },
            };
        }
    }
}

function distance_to_segment(px: number, py: number, a: Point, b: Point) {
    const [ax, ay] = a;
    const [bx, by] = b;
    const length_squared = (bx - ax) ** 2 + (by - ay) ** 2;
    const t =
        length_squared === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(
                      1,
                      ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) /
                          length_squared,
                  ),
              );
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}

function inside_polygon(px: number, py: number, points: Point[]) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
        ) {
            inside = !inside;
        }
    }
    return inside;
}

/** Whether a point in pixels lies on a shape, lines count within `tolerance` pixels */
export function shape_contains(
    shape: Shape,
    px: number,
    py: number,
    tolerance: number,
) {
    switch (shape.type) {
        case "circle":
            return Math.hypot(px - shape.cx, py - shape.cy) <= shape.r;
        case "polygon":
            return inside_polygon(px, py, shape.points);
        case "polyline":
            return shape.points.some(
                (point, i) =>
                    i > 0 &&
                    distance_to_segment(px, py, shape.points[i - 1], point) <=
                        tolerance,
            );
    }
}
