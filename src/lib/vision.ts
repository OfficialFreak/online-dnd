/**
 * What a figure sees past the walls. Everything here works in grid cells: x from 0 to the
 * columns, y from 0 to the map's height in cells. Walls are stored as fractions of the
 * map, which would distort angles and distances on maps that aren't square.
 */

export type Point = [number, number];
/** x1, y1, x2, y2 */
export type Segment = [number, number, number, number];

/** A line of walls through its points, in fractions of the map's width and height */
export type Wall = { id: string; points: Point[] };
/** A door from a to b, in fractions of the map. Everyone opens it unless the DM locked it. */
export type Door = { id: string; a: Point; b: Point; open: boolean; locked: boolean };

/** Hits closer than this to the eye don't count, e.g. a figure standing on a wall */
const NEAR = 1e-6;
/** How far beside a wall's end the rays pass, in radians */
const BESIDE = 1e-4;
/** Rays around a light with a range, its edge between them is straight */
const CIRCLE_STEPS = 64;

/**
 * The walls sorted into a grid, so a ray only tests the walls in the cells it crosses.
 * Built again when walls or doors change.
 */
export class WallIndex {
    readonly segments: Segment[];
    /** The ends of all walls, where the edge of what a figure sees can turn */
    readonly corners: Point[];
    private readonly buckets: number[][];
    private readonly bucket_columns: number;
    private readonly bucket_rows: number;
    private readonly tested: Uint32Array;
    private ray = 0;

    constructor(
        segments: Segment[],
        readonly width: number,
        readonly height: number,
        private readonly bucket = 2,
    ) {
        // The edge of the map is a wall too, so every ray ends
        this.segments = [
            ...segments,
            [0, 0, width, 0],
            [width, 0, width, height],
            [width, height, 0, height],
            [0, height, 0, 0],
        ];
        this.bucket_columns = Math.max(1, Math.ceil(width / bucket));
        this.bucket_rows = Math.max(1, Math.ceil(height / bucket));
        this.buckets = Array.from(
            { length: this.bucket_columns * this.bucket_rows },
            () => [],
        );
        this.tested = new Uint32Array(this.segments.length);

        const corners = new Map<string, Point>();
        this.segments.forEach(([x1, y1, x2, y2], index) => {
            for (const [x, y] of [
                [x1, y1],
                [x2, y2],
            ]) {
                corners.set(`${x.toFixed(4)},${y.toFixed(4)}`, [x, y]);
            }
            const left = this.column(Math.min(x1, x2));
            const right = this.column(Math.max(x1, x2));
            const top = this.row(Math.min(y1, y2));
            const bottom = this.row(Math.max(y1, y2));
            for (let column = left; column <= right; column++) {
                for (let row = top; row <= bottom; row++) {
                    // Only the cells the wall crosses, a diagonal one spans many others
                    if (this.crosses_cell(x1, y1, x2, y2, column, row)) {
                        this.buckets[row * this.bucket_columns + column].push(index);
                    }
                }
            }
        });
        this.corners = [...corners.values()];
    }

    private column(x: number) {
        return Math.min(this.bucket_columns - 1, Math.max(0, Math.floor(x / this.bucket)));
    }

    private row(y: number) {
        return Math.min(this.bucket_rows - 1, Math.max(0, Math.floor(y / this.bucket)));
    }

    /** Whether the segment touches the grid cell, a little larger so no wall slips through */
    private crosses_cell(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        column: number,
        row: number,
    ) {
        const margin = 1e-3;
        const left = column * this.bucket - margin;
        const top = row * this.bucket - margin;
        const right = left + this.bucket + 2 * margin;
        const bottom = top + this.bucket + 2 * margin;
        // Clips the segment to the cell (Liang–Barsky)
        let start = 0;
        let end = 1;
        const dx = x2 - x1;
        const dy = y2 - y1;
        for (const [p, q] of [
            [-dx, x1 - left],
            [dx, right - x1],
            [-dy, y1 - top],
            [dy, bottom - y1],
        ]) {
            if (p === 0) {
                if (q < 0) return false;
                continue;
            }
            const t = q / p;
            if (p < 0) start = Math.max(start, t);
            else end = Math.min(end, t);
            if (start > end) return false;
        }
        return true;
    }

    /**
     * How far a ray from the eye in this direction gets before a wall, at most `limit`.
     * The direction needn't be a unit vector, the distance is in its lengths.
     */
    cast(ox: number, oy: number, dx: number, dy: number, limit = Infinity) {
        this.ray = (this.ray + 1) >>> 0;
        if (this.ray === 0) {
            this.tested.fill(0);
            this.ray = 1;
        }
        let column = Math.floor(ox / this.bucket);
        let row = Math.floor(oy / this.bucket);
        const step_x = dx > 0 ? 1 : -1;
        const step_y = dy > 0 ? 1 : -1;
        // How far along the ray the next cell border in x and in y is
        const delta_x = dx === 0 ? Infinity : Math.abs(this.bucket / dx);
        const delta_y = dy === 0 ? Infinity : Math.abs(this.bucket / dy);
        let next_x =
            dx === 0
                ? Infinity
                : ((dx > 0 ? (column + 1) * this.bucket : column * this.bucket) - ox) / dx;
        let next_y =
            dy === 0
                ? Infinity
                : ((dy > 0 ? (row + 1) * this.bucket : row * this.bucket) - oy) / dy;
        let nearest = limit;

        while (true) {
            if (
                column >= 0 &&
                row >= 0 &&
                column < this.bucket_columns &&
                row < this.bucket_rows
            ) {
                for (const index of this.buckets[row * this.bucket_columns + column]) {
                    if (this.tested[index] === this.ray) continue;
                    this.tested[index] = this.ray;
                    const hit = this.hit(index, ox, oy, dx, dy);
                    if (hit < nearest) nearest = hit;
                }
            } else if (
                (column < 0 && step_x < 0) ||
                (row < 0 && step_y < 0) ||
                (column >= this.bucket_columns && step_x > 0) ||
                (row >= this.bucket_rows && step_y > 0)
            ) {
                // Left the map for good
                break;
            }
            // A wall hit before the ray leaves this cell can't be beaten further on
            const leave = Math.min(next_x, next_y);
            if (nearest <= leave) break;
            if (next_x < next_y) {
                column += step_x;
                next_x += delta_x;
            } else {
                row += step_y;
                next_y += delta_y;
            }
        }
        return nearest;
    }

    /** How far along the ray it hits this segment, Infinity if it doesn't */
    private hit(index: number, ox: number, oy: number, dx: number, dy: number) {
        const [x1, y1, x2, y2] = this.segments[index];
        const sx = x2 - x1;
        const sy = y2 - y1;
        const denominator = dx * sy - dy * sx;
        if (Math.abs(denominator) < 1e-12) return Infinity;
        const wx = x1 - ox;
        const wy = y1 - oy;
        const t = (wx * sy - wy * sx) / denominator;
        const u = (wx * dy - wy * dx) / denominator;
        if (t < NEAR || u < -1e-9 || u > 1 + 1e-9) return Infinity;
        return t;
    }

    /** Whether the eye sees this point, nothing in between */
    sees(eye: Point, point: Point) {
        const dx = point[0] - eye[0];
        const dy = point[1] - eye[1];
        if (dx === 0 && dy === 0) return true;
        // In lengths of the direction, the point is at 1
        return this.cast(eye[0], eye[1], dx, dy, 1) >= 1 - 1e-9;
    }
}

/** The walls and closed doors as segments in cells */
export function wall_segments(
    walls: Wall[],
    doors: Door[],
    columns: number,
    rows: number,
): Segment[] {
    const segments: Segment[] = [];
    for (const wall of walls) {
        for (let i = 1; i < wall.points.length; i++) {
            const [x1, y1] = wall.points[i - 1];
            const [x2, y2] = wall.points[i];
            if (x1 === x2 && y1 === y2) continue;
            segments.push([x1 * columns, y1 * rows, x2 * columns, y2 * rows]);
        }
    }
    for (const door of doors) {
        if (door.open) continue;
        segments.push([
            door.a[0] * columns,
            door.a[1] * rows,
            door.b[0] * columns,
            door.b[1] * rows,
        ]);
    }
    return segments;
}

/**
 * Everything the eye sees, as a polygon around it: rays to every wall's end and just
 * beside it, each as far as the first wall it meets. With a range, e.g. for a torch, only
 * that far, the edge then follows a circle.
 */
export function visibility_polygon(index: WallIndex, eye: Point, range = Infinity): Point[] {
    const [ox, oy] = eye;
    const angles: number[] = [];
    for (const [x, y] of index.corners) {
        if (Math.hypot(x - ox, y - oy) > range + 1e-6) continue;
        const angle = Math.atan2(y - oy, x - ox);
        angles.push(angle - BESIDE, angle, angle + BESIDE);
    }
    if (Number.isFinite(range)) {
        for (let i = 0; i < CIRCLE_STEPS; i++) {
            angles.push(-Math.PI + (i / CIRCLE_STEPS) * 2 * Math.PI);
        }
    }
    angles.sort((a, b) => a - b);
    const polygon: Point[] = [];
    let last = NaN;
    for (const angle of angles) {
        if (angle - last < 1e-9) continue;
        last = angle;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const t = index.cast(ox, oy, dx, dy, range);
        if (!Number.isFinite(t)) continue;
        polygon.push([ox + dx * t, oy + dy * t]);
    }
    return polygon;
}
