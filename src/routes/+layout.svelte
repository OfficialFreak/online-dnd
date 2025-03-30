<script>
    let { children } = $props();
    import "../app.css";
</script>
{@render children()}

<style>
    :global(html), :global(body) {
        overscroll-behavior: none;
    }
</style>