import { version } from "$app/environment";

/**
 * iOS lays a home screen app with the see-through status bar out a status bar short of
 * the screen's bottom (iOS 27): the page is drawn down to the bottom, but the window, and
 * all that is fixed to it, ends above: 56 of 874 points on an iPhone 402 points wide.
 * This is how much is missing, 0 elsewhere, also in --viewport-gap for the styles.
 */
export const viewport = $state({
    gap: 0,
    /** TEMPORARY: the measured sizes, shown in the settings to find the gap on the phone */
    report: "",
});

/** Measure the room of the status bar at the top and how far fixed elements reach */
let probes: { top: HTMLDivElement; bottom: HTMLDivElement; fixed: HTMLDivElement } | null =
    null;

function probe(css: string) {
    const element = document.createElement("div");
    element.style.cssText = `position: fixed; left: 0; width: 0; visibility: hidden; pointer-events: none; ${css}`;
    document.body.append(element);
    return element;
}

function measure() {
    probes ??= {
        top: probe("top: 0; height: env(safe-area-inset-top, 0px)"),
        bottom: probe("top: 0; height: env(safe-area-inset-bottom, 0px)"),
        fixed: probe("top: 0; bottom: 0"),
    };
    // With the opaque status bar of older installs the window starts below it, shorter by
    // it but not short. Sideways the status bar is hidden.
    const see_through = probes.top.offsetHeight > 0;
    // The window's own size, the keyboard doesn't take from it
    const { clientWidth, clientHeight } = document.documentElement;
    const fixed_height = probes.fixed.offsetHeight;
    // iOS gives the screen's size upright, also held sideways
    const screen_height =
        clientHeight >= clientWidth
            ? Math.max(screen.width, screen.height)
            : Math.min(screen.width, screen.height);
    const gap = screen_height - Math.min(clientHeight, fixed_height || clientHeight);
    viewport.gap = see_through && gap > 0 && gap < 100 ? gap : 0;
    document.documentElement.style.setProperty("--viewport-gap", `${viewport.gap}px`);
    viewport.report = [
        `Version ${version}`,
        `Bildschirm ${screen.width}×${screen.height}`,
        `Fenster ${clientWidth}×${clientHeight}`,
        `innen ${innerWidth}×${innerHeight}`,
        `sichtbar ${Math.round(visualViewport?.height ?? 0)}`,
        `fest ${fixed_height}`,
        `oben ${probes.top.offsetHeight} unten ${probes.bottom.offsetHeight}`,
        `Lücke ${viewport.gap}`,
    ].join(" · ");
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
    // iOS may still size the window while the app opens, without telling
    addEventListener("load", measure);
    setTimeout(measure, 1000);
    setTimeout(measure, 3000);
}

/** The height of the screen the page is drawn on */
export function screen_height() {
    return innerHeight + viewport.gap;
}
