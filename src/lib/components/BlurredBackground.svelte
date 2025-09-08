<script lang="ts">
    import { appState } from "../state.svelte";

    const { file, blur, position = "fixed" } = $props();

    let background_url = $derived(
        appState.token
            ? `${appState.secure ? "https://" : "http://"}${appState.baseUrl}/assets/${file}?key=${encodeURIComponent(appState.token)}`
            : "",
    );
</script>

<div
    style="background: url({background_url}); filter: blur({blur}px); background-size: cover;"
    class="{position} h-full max-h-screen mt-[-30px] pointer-events-none w-full bg-repeat bg-auto"
></div>
