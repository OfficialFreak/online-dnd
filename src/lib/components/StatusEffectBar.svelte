<script lang="ts">
    import StatusIcon from "./StatusIcon.svelte";

    let { effects } = $props();
</script>

<div
    class="max-w-[50vw] overflow-x-auto h-20 px-8 flex justify-start items-end no-scrollbar"
>
    <div class="flex gap-1 bg-base-200 rounded-box py-1 px-1">
        {#each effects as effect}
            <StatusIcon {effect} />
        {/each}
    </div>
</div>

<style>
    .no-scrollbar {
        scrollbar-width: none;
    }
</style>
