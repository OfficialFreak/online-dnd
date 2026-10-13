/**
 * Switches for finding what makes Safari on an iPhone run out of memory, set in the
 * address: /app?debug=still,nofog. Read once when the app starts.
 *
 * - still: a video map shows its still picture instead of the video
 * - nofog: the fog isn't drawn
 * - nopattern: the fog is drawn without its texture
 * - novision: no sight and lights over the map
 * - nomarkers: no figures on the map
 * - nogrid: no grid
 * - flatzoom: the map is only scaled when zooming, not laid out at its zoom
 * - nooverlays: only the map's picture, no layer over it
 */
export const debug: ReadonlySet<string> = new Set(
    typeof location === "undefined"
        ? []
        : (new URLSearchParams(location.search).get("debug") ?? "")
              .split(",")
              .map((flag) => flag.trim())
              .filter(Boolean),
);
