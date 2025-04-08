<script lang="ts">
    import { appState } from "../../routes/state.svelte";

    const { file } = $props();

    let background_url = $derived(`${appState.secure ? 'https://' : 'http://'}${appState.base_url}/assets/${file}?key=${appState.token}`);
</script>

<div style={`background: url(${background_url})`} class="absolute h-full max-h-screen mt-[-30px] pointer-events-none w-full bg-repeat bg-auto">
</div>