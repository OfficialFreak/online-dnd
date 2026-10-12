<script lang="ts">
    import "@fontsource/cinzel-decorative/700.css";
    import { onMount } from "svelte";
    import { Tween } from "svelte/motion";
    import { cubicIn, cubicOut, linear } from "svelte/easing";
    import { register_intro } from "$lib/scene-intro.svelte";
    import { billows, smoothstep } from "$lib/noise";

    /**
     * Between two scenes smoke closes in from the edges, the scene's name unrolls on a
     * scroll in the middle, and the smoke draws back from the new map. Above the map and
     * below the controls, which stay usable.
     */

    /** How far the smoke covers the screen, from 0 to 1 */
    const smoke = new Tween(0);
    /** How far the scroll is unrolled, from 0 to 1 */
    const unrolled = new Tween(0);
    let name = $state("");
    let scroll_shown = $state(false);
    let paper_width = $state(0);
    let canvas: HTMLCanvasElement | undefined = $state();
    /** A new scene during an intro ends the one before */
    let run = 0;
    let frame = 0;
    /** Ends the smoke closing in at once, when the window can't be seen */
    let end_cover: (() => void) | null = null;
    /** Fully covered it was drawn once, it needn't be again until the smoke draws back */
    let drawn_covered = false;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let image: ImageData | null = null;

    /** The smoke in a small picture the browser stretches softly over the screen */
    function draw() {
        if (!canvas) return;
        const width = 160;
        const height = Math.max(1, Math.round((width * innerHeight) / Math.max(1, innerWidth)));
        if (canvas.width !== width || canvas.height !== height || !image) {
            canvas.width = width;
            canvas.height = height;
            image = new ImageData(width, height);
        }
        const ctx = canvas.getContext("2d")!;
        const time = performance.now() / 1000;
        // From the edges inwards: the middle is covered last and cleared first
        const level = smoke.current * 1.3 - 0.15;
        const data = image.data;
        for (let y = 0; y < height; y++) {
            const v = (y / height - 0.5) * 2;
            for (let x = 0; x < width; x++) {
                const u = (x / width - 0.5) * 2;
                const middle = 1 - Math.min(1, Math.sqrt(u * u + v * v) / Math.SQRT2);
                const swirl = billows(x * 0.045 + time * 0.12, y * 0.045 - time * 0.08, 3);
                const threshold = 0.6 * middle + 0.4 * swirl;
                const alpha = smoothstep(threshold - 0.12, threshold + 0.12, level);
                // A lighter rim where the smoke rolls on
                const rim = (1 - Math.abs(2 * alpha - 1)) * (0.6 + 0.4 * swirl);
                const i = (y * width + x) * 4;
                data[i] = 13 + 62 * rim;
                data[i + 1] = 11 + 55 * rim;
                data[i + 2] = 18 + 66 * rim;
                data[i + 3] = 255 * alpha;
            }
        }
        ctx.putImageData(image, 0, 0);
    }

    function animate() {
        const covered = smoke.current >= 1 && smoke.target >= 1;
        if (!covered || !drawn_covered) draw();
        drawn_covered = covered;
        // Covered it rests until the smoke draws back, which starts it again
        frame =
            (smoke.current > 0 || smoke.target > 0) && !covered
                ? requestAnimationFrame(animate)
                : 0;
    }

    function start_smoke() {
        if (!frame) frame = requestAnimationFrame(animate);
    }

    function cover() {
        run++;
        if (document.hidden) return Promise.resolve();
        start_smoke();
        if (scroll_shown) {
            // Rolled up at once, the next name follows
            unrolled.set(0, { duration: 200 }).then(() => (scroll_shown = false));
        }
        // A tween stopped before its end never finishes, so it ends here too
        return new Promise<void>((resolve) => {
            end_cover = resolve;
            // Evenly: the smoke itself rolls in from the edges and closes in the middle
            smoke.set(1, { duration: 1100, easing: linear }).then(() => {
                if (end_cover === resolve) end_cover = null;
                resolve();
            });
        });
    }

    /**
     * A window that can't be seen stops animating, the scene waited behind the smoke until
     * it came back. Everything ends at once instead, the new scene is there.
     */
    function skip() {
        run++;
        smoke.set(0, { duration: 0 });
        unrolled.set(0, { duration: 0 });
        scroll_shown = false;
        drawn_covered = false;
        cancelAnimationFrame(frame);
        frame = 0;
        const resolve = end_cover;
        end_cover = null;
        resolve?.();
    }

    async function reveal(scene_name: string, ready: Promise<unknown>) {
        if (document.hidden) {
            skip();
            return;
        }
        const mine = run;
        name = scene_name;
        unrolled.set(0, { duration: 0 });
        scroll_shown = true;
        await unrolled.set(1, { duration: 900, easing: cubicOut });
        if (mine !== run) return;
        // Long enough to read, longer while the map loads, but not forever
        await Promise.all([
            wait(1500 + scene_name.length * 25),
            Promise.race([ready, wait(4000)]),
        ]);
        if (mine !== run) return;
        start_smoke();
        smoke.set(0, { duration: 1700, easing: linear });
        await unrolled.set(0, { duration: 650, easing: cubicIn });
        if (mine !== run) return;
        scroll_shown = false;
    }

    function on_visibility() {
        if (document.hidden && (smoke.current > 0 || smoke.target > 0 || scroll_shown)) {
            skip();
        }
    }

    onMount(() => {
        register_intro({ cover, reveal });
        document.addEventListener("visibilitychange", on_visibility);
        return () => {
            register_intro(null);
            document.removeEventListener("visibilitychange", on_visibility);
            cancelAnimationFrame(frame);
        };
    });
</script>

<canvas
    bind:this={canvas}
    class="fixed inset-0 w-full h-full pointer-events-none"
    style:display={smoke.current > 0 ? "block" : "none"}
    aria-hidden="true"
></canvas>

{#if scroll_shown}
    <div
        class="fixed inset-0 z-[999] flex items-center justify-center pointer-events-none px-8"
        role="status"
    >
        <div
            class="scroll"
            style:opacity={Math.min(1, unrolled.current * 4)}
            style:transform="scale({0.92 + 0.08 * unrolled.current})"
        >
            <div
                class="paper"
                bind:clientWidth={paper_width}
                style:clip-path="inset(-2px {(1 - unrolled.current) * 50}% -2px {(1 -
                    unrolled.current) *
                    50}%)"
            >
                <div class="flourish" aria-hidden="true"><span>✦</span></div>
                <h2>{name}</h2>
                <div class="flourish" aria-hidden="true"><span>✦</span></div>
            </div>
            <div
                class="roller"
                style:transform="translateX({(-unrolled.current * paper_width) / 2}px)"
            ></div>
            <div
                class="roller"
                style:transform="translateX({(unrolled.current * paper_width) / 2}px)"
            ></div>
        </div>
    </div>
{/if}

<style>
    .scroll {
        position: relative;
        max-width: min(46rem, 100%);
        filter: drop-shadow(0 14px 30px rgba(0, 0, 0, 0.65));
    }

    .paper {
        position: relative;
        padding: 1.6rem 3.75rem 1.7rem;
        min-width: min(20rem, 70vw);
        color: #3d2410;
        text-align: center;
        background:
            radial-gradient(ellipse at 28% 18%, rgba(255, 249, 228, 0.6), transparent 60%),
            radial-gradient(ellipse at 78% 85%, rgba(140, 90, 35, 0.22), transparent 55%),
            radial-gradient(circle at 12% 78%, rgba(120, 75, 30, 0.18), transparent 18%),
            radial-gradient(circle at 88% 22%, rgba(120, 75, 30, 0.14), transparent 14%),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='240'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.03' numOctaves='3' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 0.42 0 0 0 0 0.27 0 0 0 0 0.1 0 0 0 -1.6 1.05'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E"),
            linear-gradient(
                90deg,
                rgba(85, 50, 18, 0.45),
                transparent 9%,
                transparent 91%,
                rgba(85, 50, 18, 0.45)
            ),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.36 0 0 0 0 0.22 0 0 0 0 0.08 0 0 0 0.32 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"),
            #e8d09b;
        box-shadow:
            inset 0 0 28px rgba(120, 72, 22, 0.5),
            inset 0 0 4px rgba(90, 50, 15, 0.6);
    }

    h2 {
        font-family: "Cinzel Decorative", "Cinzel", Georgia, serif;
        font-weight: 700;
        font-size: clamp(1.5rem, 3.6vw, 2.7rem);
        line-height: 1.15;
        letter-spacing: 0.02em;
        margin: 0.35rem 0;
        overflow-wrap: anywhere;
        text-shadow:
            0 1px 0 rgba(255, 244, 212, 0.65),
            0 0 1px rgba(60, 30, 8, 0.5);
    }

    .flourish {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin: 0 auto;
        width: min(14rem, 80%);
        color: rgba(110, 62, 20, 0.75);
        font-size: 0.7rem;
    }

    .flourish::before,
    .flourish::after {
        content: "";
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(110, 62, 20, 0.7), transparent);
    }

    .roller {
        position: absolute;
        top: -0.9rem;
        bottom: -0.9rem;
        left: 50%;
        width: 1.4rem;
        margin-left: -0.7rem;
        border-radius: 0.7rem;
        background: linear-gradient(
            90deg,
            #24130a,
            #6b4021 28%,
            #a8703a 47%,
            #7a4a23 64%,
            #2a160a
        );
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
    }

    .roller::before,
    .roller::after {
        content: "";
        position: absolute;
        left: 50%;
        width: 1.9rem;
        height: 0.75rem;
        margin-left: -0.95rem;
        border-radius: 0.375rem;
        background: linear-gradient(90deg, #5a3c0e, #d6a64a 42%, #f6d684 54%, #8a6420);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
    }

    .roller::before {
        top: -0.45rem;
    }

    .roller::after {
        bottom: -0.45rem;
    }
</style>
