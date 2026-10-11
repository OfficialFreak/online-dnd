/** Space kept between a menu and the edges of the window */
const MARGIN = 8;
/** Height of the title bar */
const TITLEBAR = 30;

/**
 * Moves a hover menu when it opens, so it stays inside the window and below the title bar.
 * A menu that runs out on the right goes to the left of what opened it instead. With
 * `below`, it also stays below the element with that id if there is room.
 * The menu needs `translate(var(--shift-x, 0px), var(--shift-y, 0px))` in its transform.
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
            node.style.removeProperty("--shift-x");
            node.style.removeProperty("--shift-y");
            const rect = node.getBoundingClientRect();
            if (rect.height === 0) return;
            const anchor = trigger.getBoundingClientRect();

            let shift_x = 0;
            if (rect.right > window.innerWidth - MARGIN) {
                shift_x = anchor.left - rect.width - rect.left;
                if (rect.left + shift_x < MARGIN) shift_x = MARGIN - rect.left;
            }
            const left = rect.left + shift_x;
            const right = rect.right + shift_x;

            const bottom = window.innerHeight - MARGIN;
            let top = TITLEBAR + MARGIN;
            const obstacle = options.below
                ? document.getElementById(options.below)?.getBoundingClientRect()
                : undefined;
            if (
                obstacle &&
                obstacle.height > 0 &&
                left < obstacle.right &&
                right > obstacle.left &&
                bottom - (obstacle.bottom + MARGIN) >= rect.height &&
                // The mouse has to reach the menu from what opened it
                anchor.top + anchor.height / 2 > obstacle.bottom + MARGIN
            ) {
                top = Math.max(top, obstacle.bottom + MARGIN);
            }

            let shift_y = 0;
            if (rect.bottom > bottom) shift_y = bottom - rect.bottom;
            if (rect.top + shift_y < top) shift_y = top - rect.top;

            // The shift happens inside its parent, which may be zoomed like the map
            const scale = anchor.width / trigger.offsetWidth || 1;
            if (shift_x) node.style.setProperty("--shift-x", `${shift_x / scale}px`);
            if (shift_y) node.style.setProperty("--shift-y", `${shift_y / scale}px`);
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
