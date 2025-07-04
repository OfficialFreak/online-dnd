<script lang="ts">
    import StatusIcon from "./StatusIcon.svelte";

    let { effects } = $props();
</script>

<div class="flex gap-1 frosted rounded-box py-1 px-1">
    {#each effects as effect}
        <StatusIcon {effect} />
    {/each}
</div>
