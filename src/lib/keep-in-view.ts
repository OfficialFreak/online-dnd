/** Space kept between a menu and the edges of the window */
const MARGIN = 8;
/** The dice and the turn button at the bottom of the window stay uncovered */
const BOTTOM_CONTROLS = 48;

/**
 * Bottom of the title bar, which moves down for the notch of phones. Also when the
 * controls are folded away and the page starts above it, its dot and button are there.
 */
function titlebar_bottom() {
    return document.querySelector(".titlebar")?.getBoundingClientRect().bottom ?? 30;
}

/**
 * Moves a hover menu when it opens, so it stays inside the window and below the title bar.
 * A menu that runs out on the right goes to the left of what opened it instead. With
 * `below`, it also stays below the element with that id if there is room. A menu taller
 * than the window, like a marker's on a phone held sideways, gets as high as there is
 * room and scrolls.
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

    function place(event?: Event) {
        // Taps and fields in the open menu leave it where it is, also its scrolling
        if (event?.target instanceof Node && node.contains(event.target)) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(place_now);
    }

    function place_now() {
        node.style.removeProperty("--shift-x");
        node.style.removeProperty("--shift-y");
        node.style.removeProperty("max-height");
        node.style.removeProperty("overflow-y");
        node.style.removeProperty("overscroll-behavior");
        let rect = node.getBoundingClientRect();
        if (rect.height === 0) return;
        const anchor = trigger.getBoundingClientRect();

        // Next to what opened it, on the left if there's no room on the right, and
        // always inside the window, also beside a marker wider than the room next to it
        const max_right = window.innerWidth - MARGIN;
        // Right of the toolbar and its panel, which lie above the map, if there is room
        let min_left = MARGIN;
        for (const clear of document.querySelectorAll("[data-keep-clear]")) {
            if (clear === node || clear.contains(node)) continue;
            const area = clear.getBoundingClientRect();
            if (area.width > 0 && area.left < window.innerWidth / 2) {
                min_left = Math.max(min_left, area.right + MARGIN);
            }
        }
        if (min_left + rect.width > max_right) min_left = MARGIN;
        let shift_x = 0;
        if (rect.right > max_right) shift_x = anchor.left - rect.width - rect.left;
        shift_x = Math.min(shift_x, max_right - rect.right);
        shift_x = Math.max(shift_x, min_left - rect.left);
        const left = rect.left + shift_x;
        const right = rect.right + shift_x;

        // Short windows have no room to spare for the controls at the bottom
        const bottom =
            window.innerHeight -
            MARGIN -
            (window.innerHeight > 600 ? BOTTOM_CONTROLS : 0);
        let top = titlebar_bottom() + MARGIN;
        const obstacle = options.below
            ? document.getElementById(options.below)?.getBoundingClientRect()
            : undefined;
        if (
            obstacle &&
            obstacle.height > 0 &&
            left < obstacle.right &&
            right > obstacle.left &&
            bottom - (obstacle.bottom + MARGIN) >= rect.height
        ) {
            top = Math.max(top, obstacle.bottom + MARGIN);
        }

        if (rect.height > bottom - top) {
            // In its own pixels, the menu and its parent may be scaled
            const scale_y = rect.height / node.offsetHeight || 1;
            node.style.maxHeight = `${(bottom - top) / scale_y}px`;
            node.style.overflowY = "auto";
            node.style.overscrollBehavior = "contain";
            // A shorter menu may sit somewhere else, e.g. when it is centered
            rect = node.getBoundingClientRect();
        }

        let shift_y = 0;
        if (rect.bottom > bottom) shift_y = bottom - rect.bottom;
        if (rect.top + shift_y < top) shift_y = top - rect.top;

        // The shift happens inside its parent, which may be zoomed like the map
        const scale = anchor.width / trigger.offsetWidth || 1;
        if (shift_x) node.style.setProperty("--shift-x", `${shift_x / scale}px`);
        if (shift_y) node.style.setProperty("--shift-y", `${shift_y / scale}px`);
    }

    // Also when it opens without the events above, e.g. by a tap on a touch screen. Before
    // it is painted, so it doesn't flash at the edge first.
    let shown = false;
    const observer = new ResizeObserver(() => {
        const visible = node.offsetHeight > 0;
        if (visible && !shown) {
            cancelAnimationFrame(frame);
            place_now();
        }
        shown = visible;
    });
    observer.observe(node);

    trigger.addEventListener("mouseenter", place);
    trigger.addEventListener("focusin", place);
    // A tap on a touch screen doesn't always bring a mouseenter along
    trigger.addEventListener("pointerdown", place);
    return {
        destroy() {
            cancelAnimationFrame(frame);
            observer.disconnect();
            trigger.removeEventListener("mouseenter", place);
            trigger.removeEventListener("focusin", place);
            trigger.removeEventListener("pointerdown", place);
        },
    };
}
