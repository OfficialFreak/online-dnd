/** Space kept between a menu and the edges of the window */
const MARGIN = 8;
/** Height of the title bar */
const TITLEBAR = 30;

/**
 * Moves a hover menu up or down when it opens, so it stays inside the window and below
 * the title bar. With `below`, it also stays below the element with that id if there is room.
 * The menu needs `translateY(var(--shift, 0px))` in its transform.
 */
export function keep_in_view(
    node: HTMLElement,
    options: { below?: string } = {},
) {
    const parent = node.parentElement;
    if (!parent) return;
    const trigger: HTMLElement = parent;
    let frame = 0;

    function place() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            node.style.removeProperty("--shift");
            const rect = node.getBoundingClientRect();
            if (rect.height === 0) return;

            const bottom = window.innerHeight - MARGIN;
            let top = TITLEBAR + MARGIN;
            const obstacle = options.below
                ? document.getElementById(options.below)?.getBoundingClientRect()
                : undefined;
            const anchor = trigger.getBoundingClientRect();
            if (
                obstacle &&
                obstacle.height > 0 &&
                rect.left < obstacle.right &&
                rect.right > obstacle.left &&
                bottom - (obstacle.bottom + MARGIN) >= rect.height &&
                // The mouse has to reach the menu from what opened it
                anchor.top + anchor.height / 2 > obstacle.bottom + MARGIN
            ) {
                top = Math.max(top, obstacle.bottom + MARGIN);
            }

            let shift = 0;
            if (rect.bottom > bottom) shift = bottom - rect.bottom;
            if (rect.top + shift < top) shift = top - rect.top;
            if (shift === 0) return;
            // The shift happens inside its parent, which may be zoomed like the map
            const scale = anchor.width / trigger.offsetWidth || 1;
            node.style.setProperty("--shift", `${shift / scale}px`);
        });
    }

    trigger.addEventListener("mouseenter", place);
    trigger.addEventListener("focusin", place);
    return {
        destroy() {
            cancelAnimationFrame(frame);
            trigger.removeEventListener("mouseenter", place);
            trigger.removeEventListener("focusin", place);
        },
    };
}
