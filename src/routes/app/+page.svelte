<script>
    import { load } from "@tauri-apps/plugin-store";
    import { onMount } from "svelte";

    let store = $state();
    let token = $state();

    onMount(async () => {
        store = await load('store.json', { autoSave: false });
        const tmp_token = await store.get('token');
        token = tmp_token.value;
    })
</script>

Token that worked: {token}