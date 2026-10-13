/**
 * iOS lays a home screen app with the see-through status bar out a status bar short of
 * the screen's bottom (iOS 27): the page is drawn down to the bottom, but the window, and
 * all that is fixed to it, ends above: 56 of 874 points on an iPhone 402 points wide.
 * This is how much is missing, 0 elsewhere, also in --viewport-gap for the styles.
 */
export const viewport = $state({ gap: 0 });

/** Measures the room of the status bar at the top */
let probe: HTMLDivElement | null = null;

function measure() {
    // With the opaque status bar of older installs the window starts below it, shorter by
    // it but not short. Sideways the status bar is hidden.
    if (!probe) {
        probe = document.createElement("div");
        probe.style.cssText =
            "position: fixed; top: 0; height: env(safe-area-inset-top, 0px); visibility: hidden; pointer-events: none";
        document.body.append(probe);
    }
    const see_through = probe.offsetHeight > 0;
    // The window's own size, the keyboard doesn't take from it
    const { clientWidth, clientHeight } = document.documentElement;
    // iOS gives the screen's size upright, also held sideways
    const screen_height =
        clientHeight >= clientWidth
            ? Math.max(screen.width, screen.height)
            : Math.min(screen.width, screen.height);
    const gap = screen_height - clientHeight;
    viewport.gap = see_through && gap > 0 && gap < 100 ? gap : 0;
    document.documentElement.style.setProperty("--viewport-gap", `${viewport.gap}px`);
}

// Android gives the screen with its system bars, the window is shorter by them there
if (
    typeof window !== "undefined" &&
    navigator.maxTouchPoints > 1 &&
    /iPhone|iPad|Macintosh/.test(navigator.userAgent) &&
    ((navigator as { standalone?: boolean }).standalone ||
        matchMedia("(display-mode: standalone)").matches)
) {
    measure();
    addEventListener("resize", measure);
}

/** The height of the screen the page is drawn on */
export function screen_height() {
    return innerHeight + viewport.gap;
}
