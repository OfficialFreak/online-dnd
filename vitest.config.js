import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

// The SvelteKit plugin resolves $lib in what the tests import
export default defineConfig({
    plugins: [sveltekit()],
    test: {
        include: ["tests/**/*.test.ts"],
    },
});
