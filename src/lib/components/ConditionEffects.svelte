<script lang="ts">
    import { CONDITIONS } from "$lib/conditions";
    import StatusIcon from "./StatusIcon.svelte";

    /** Conditions of a marker, the overlay covers exactly the marker */
    let {
        effects,
        rounds = {},
        moving = true,
    }: {
        effects: string[];
        /** Rounds left of those that end by themselves */
        rounds?: Record<string, number>;
        /** Without, only the icons show */
        moving?: boolean;
    } = $props();

    const MAX_ICONS = 4;
</script>

<!-- Not a div: daisyUI clips the divs directly inside an avatar -->
<span class="condition-effects" aria-hidden="true">
    {#each moving ? effects : [] as effect (effect)}
        {@const condition = CONDITIONS[effect]}
        {#if condition?.aura}
            <div class="aura" style="--aura: {condition.color}"></div>
        {/if}
        {#if condition?.veil}
            <div class="veil mask mask-hexagon"></div>
        {/if}
        {#if condition?.fire}
            <div class="fire-glow"></div>
            <div class="fire">
                {#each [0, 1, 2] as i (i)}
                    <span class="flame" style="--i: {i}"></span>
                {/each}
                {#each [0, 1, 2, 3] as i (i)}
                    <span class="ember" style="--i: {i}"></span>
                {/each}
            </div>
        {/if}
        {#if condition?.particles}
            <div class="particles {condition.particles.motion}">
                {#each condition.particles.symbols as symbol, i}
                    <span
                        style="--i: {i}; --n: {condition.particles.symbols
                            .length}">{symbol}</span
                    >
                {/each}
            </div>
        {/if}
    {/each}
    {#if effects.length > 0}
        <div class="icons">
            {#each effects.slice(0, MAX_ICONS) as effect (effect)}
                <div class="icon-slot">
                    <StatusIcon {effect} compact />
                    {#if rounds[effect]}
                        <span class="rounds">{rounds[effect]}</span>
                    {/if}
                </div>
            {/each}
            {#if effects.length > MAX_ICONS}
                <div class="icon-slot more">+{effects.length - MAX_ICONS}</div>
            {/if}
        </div>
    {/if}
</span>

<style>
    .condition-effects {
        display: block;
        position: absolute;
        inset: 0;
        pointer-events: none;
        container-type: size;
    }

    .aura {
        position: absolute;
        inset: -14%;
        z-index: -1;
        border-radius: 50%;
        background: radial-gradient(
            circle,
            color-mix(in srgb, var(--aura) 80%, transparent) 45%,
            transparent 70%
        );
        animation: aura 2.2s ease-in-out infinite;
    }

    .veil {
        position: absolute;
        inset: 0;
        background: black;
        animation: veil 3s ease-in-out infinite;
    }

    .particles {
        position: absolute;
        inset: 0;
    }

    /* A warm light from below that flickers like a fire, behind the marker */
    .fire-glow {
        position: absolute;
        inset: -16% -12% -8%;
        z-index: -1;
        border-radius: 50%;
        background: radial-gradient(
            ellipse at 50% 80%,
            rgb(255 140 30 / 0.9) 0%,
            rgb(255 70 0 / 0.55) 38%,
            transparent 70%
        );
        transform-origin: 50% 90%;
        animation: fire-glow 1.1s ease-in-out infinite;
    }

    .fire {
        position: absolute;
        inset: 0;
    }

    /* Soft tongues of flame along the bottom edge, the middle one the tallest */
    .flame {
        position: absolute;
        bottom: -6%;
        left: calc(14% + var(--i) * 24%);
        width: 24cqw;
        height: calc(34cqw + (1 - (var(--i) - 1) * (var(--i) - 1)) * 12cqw);
        border-radius: 50% 50% 45% 45% / 65% 65% 35% 35%;
        background: radial-gradient(
            ellipse at 50% 85%,
            #fff4b8 0%,
            #ffbe3b 25%,
            #ff6a00 55%,
            rgb(255 50 0 / 0) 75%
        );
        opacity: 0.9;
        transform-origin: 50% 100%;
        animation: flame calc(0.7s + var(--i) * 0.13s) ease-in-out infinite alternate;
        animation-delay: calc(var(--i) * -0.31s);
    }

    /* Sparks drifting up and going out */
    .ember {
        position: absolute;
        bottom: 12%;
        left: calc(26% + var(--i) * 15%);
        width: 7cqw;
        height: 7cqw;
        border-radius: 50%;
        background: radial-gradient(circle, #fff1a8 0%, #ff7a1a 45%, transparent 70%);
        opacity: 0;
        animation: ember 1.9s ease-out infinite;
        animation-delay: calc(var(--i) * -0.47s);
    }

    .particles span {
        position: absolute;
        line-height: 1;
        font-size: 26cqw;
        translate: -50% -50%;
        opacity: 0;
        animation-iteration-count: infinite;
        animation-timing-function: ease-out;
    }

    /* Bubbles, hearts, flames and zzz float up */
    .rise span {
        left: calc(30% + var(--i) * 22%);
        top: 70%;
        animation-name: rise;
        animation-duration: 2.4s;
        animation-delay: calc(var(--i) * -0.8s);
    }

    /* Sweat and blood drip down */
    .fall span {
        left: calc(28% + var(--i) * 40%);
        top: 30%;
        font-size: 20cqw;
        animation-name: fall;
        animation-duration: 1.8s;
        animation-timing-function: ease-in;
        animation-delay: calc(var(--i) * -0.9s);
    }

    /* Stars circle around the head */
    .orbit span {
        left: 50%;
        top: 8%;
        font-size: 18cqw;
        opacity: 1;
        animation-name: orbit;
        animation-duration: 2s;
        animation-timing-function: linear;
        animation-delay: calc(var(--i) / var(--n) * -2s);
    }

    /* An exclamation mark pops up over the head */
    .pop span {
        left: 50%;
        top: -6%;
        font-size: 34cqw;
        transform-origin: bottom center;
        animation-name: pop;
        animation-duration: 1.6s;
    }

    /* Sparks flash up here and there */
    .flash span {
        left: calc(22% + var(--i) * 56%);
        top: calc(30% + var(--i) * 25%);
        animation-name: flash;
        animation-duration: 1.8s;
        animation-timing-function: linear;
        animation-delay: calc(var(--i) * -0.9s);
    }

    /* A symbol hovers next to the head */
    .bob span {
        left: 84%;
        top: 16%;
        font-size: 24cqw;
        opacity: 1;
        animation-name: bob;
        animation-duration: 1.4s;
        animation-timing-function: ease-in-out;
    }

    /* Ghosts swoop around the marker in a figure eight and fade through its middle */
    .haunt span {
        left: 50%;
        top: 45%;
        font-size: 22cqw;
        animation-name: haunt;
        animation-duration: 4.5s;
        animation-timing-function: ease-in-out;
        animation-delay: calc(var(--i) / var(--n) * -4.5s);
    }

    .icons {
        position: absolute;
        left: 50%;
        bottom: -12%;
        translate: -50% 0;
        display: flex;
        gap: 2cqw;
    }

    .icon-slot {
        position: relative;
        width: 22cqw;
        height: 22cqw;
    }

    /* Rounds left, at the top right of the icon */
    .rounds {
        position: absolute;
        top: -18%;
        right: -22%;
        min-width: 60%;
        padding: 0 8%;
        border-radius: 9999px;
        background: var(--color-base-content);
        color: var(--color-base-100);
        font-size: 9cqw;
        font-weight: bold;
        line-height: 1.3;
        text-align: center;
        font-variant-numeric: tabular-nums;
    }

    .more {
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        background: var(--color-base-100);
        color: var(--color-base-content);
        font-size: 10cqw;
        font-weight: bold;
    }

    @keyframes aura {
        0%,
        100% {
            opacity: 0.45;
            scale: 0.96;
        }
        50% {
            opacity: 1;
            scale: 1.06;
        }
    }

    @keyframes fire-glow {
        0%,
        100% {
            opacity: 0.7;
            scale: 1 0.96;
        }
        23% {
            opacity: 1;
            scale: 1.04 1.08;
        }
        41% {
            opacity: 0.8;
            scale: 0.98 1;
        }
        68% {
            opacity: 0.95;
            scale: 1.02 1.1;
        }
    }

    @keyframes flame {
        0% {
            transform: scale(1, 0.9) skewX(-4deg);
            opacity: 0.8;
        }
        50% {
            transform: scale(0.88, 1.12) skewX(3deg);
            opacity: 1;
        }
        100% {
            transform: scale(1.04, 0.95) skewX(-1deg);
            opacity: 0.85;
        }
    }

    @keyframes ember {
        0% {
            opacity: 0;
            transform: translate(0, 0) scale(1);
        }
        15% {
            opacity: 1;
        }
        100% {
            opacity: 0;
            transform: translate(calc((var(--i) - 1.5) * 7cqw), -75cqh) scale(0.4);
        }
    }

    @keyframes veil {
        0%,
        100% {
            opacity: 0.15;
        }
        50% {
            opacity: 0.6;
        }
    }

    @keyframes rise {
        0% {
            opacity: 0;
            transform: translateY(0) scale(0.6);
        }
        20% {
            opacity: 1;
        }
        100% {
            opacity: 0;
            transform: translateY(-75cqh) scale(1.05);
        }
    }

    @keyframes fall {
        0% {
            opacity: 0;
            transform: translateY(0) scale(0.8);
        }
        15% {
            opacity: 1;
        }
        100% {
            opacity: 0;
            transform: translateY(60cqh) scale(1);
        }
    }

    /* An ellipse around the head, smaller and dimmer behind it */
    @keyframes orbit {
        0%,
        100% {
            transform: translate(38cqw, 0) scale(1);
            opacity: 1;
        }
        12.5% {
            transform: translate(27cqw, 7cqh) scale(1.05);
        }
        25% {
            transform: translate(0, 10cqh) scale(1.1);
            opacity: 1;
        }
        37.5% {
            transform: translate(-27cqw, 7cqh) scale(1.05);
        }
        50% {
            transform: translate(-38cqw, 0) scale(1);
        }
        62.5% {
            transform: translate(-27cqw, -7cqh) scale(0.85);
        }
        75% {
            transform: translate(0, -10cqh) scale(0.7);
            opacity: 0.5;
        }
        87.5% {
            transform: translate(27cqw, -7cqh) scale(0.85);
        }
    }

    @keyframes pop {
        0% {
            opacity: 0;
            transform: scale(0);
        }
        15% {
            opacity: 1;
            transform: scale(1.3);
        }
        30%,
        60% {
            opacity: 1;
            transform: scale(1);
        }
        80%,
        100% {
            opacity: 0;
            transform: scale(0.8);
        }
    }

    @keyframes flash {
        0%,
        100% {
            opacity: 0;
            transform: scale(0.8);
        }
        4% {
            opacity: 1;
            transform: scale(1.2);
        }
        10% {
            opacity: 0;
        }
        14% {
            opacity: 1;
            transform: scale(1);
        }
        20% {
            opacity: 0;
        }
    }

    @keyframes bob {
        0%,
        100% {
            transform: translateY(-4cqh);
        }
        50% {
            transform: translateY(4cqh);
        }
    }

    @keyframes haunt {
        0%,
        50%,
        100% {
            transform: translate(0, 0) scale(0.6);
            opacity: 0;
        }
        12.5% {
            transform: translate(30cqw, 22cqh) scale(0.9) rotate(10deg);
            opacity: 0.9;
        }
        25% {
            transform: translate(44cqw, 0) scale(1.1) rotate(-6deg);
            opacity: 1;
        }
        37.5% {
            transform: translate(30cqw, -22cqh) scale(0.9) rotate(8deg);
            opacity: 0.9;
        }
        62.5% {
            transform: translate(-30cqw, 22cqh) scale(0.9) rotate(-10deg);
            opacity: 0.9;
        }
        75% {
            transform: translate(-44cqw, 0) scale(1.1) rotate(6deg);
            opacity: 1;
        }
        87.5% {
            transform: translate(-30cqw, -22cqh) scale(0.9) rotate(-8deg);
            opacity: 0.9;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .aura,
        .veil,
        .particles,
        .fire-glow,
        .fire {
            display: none;
        }
    }
</style>
