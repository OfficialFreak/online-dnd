<script lang="ts">
    let { effect } = $props();
</script>

<div
    class="p-2 rounded-full flex justify-center items-center bg-base-100 tooltip"
    data-tip={effect}
>
    {#if effect === "blinded"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="icon"
            ><path
                fill="#fff"
                d="M9.55,3.05A10.27,10.27,0,0,0,0,9.47a10.33,10.33,0,0,0,19.12,0A10.29,10.29,0,0,0,9.55,3.05Zm0,11.3A8.67,8.67,0,0,1,1.71,9.47a8.75,8.75,0,0,1,15.69,0A8.71,8.71,0,0,1,9.55,14.35Z"
            ></path><line
                stroke="#fff"
                fill="#fff"
                x1="18.17"
                y1="0.71"
                x2="1.17"
                y2="17.79"
            ></line><path
                fill="#fff"
                d="M8,10.56a1,1,0,0,1-.11.16,2.4,2.4,0,0,1-.48.44,1.16,1.16,0,0,1-.24.15A3.4,3.4,0,0,0,12.36,7C11,8.3,9.34,9.25,8,10.56Z"
            ></path></svg
        >
    {:else if effect === "charmed"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon"
            ><path
                fill="#fff"
                d="M15.7,12.4c0,0-0.1,0-0.1,0c0-0.1,0-0.1,0-0.2c0-4.3-3.2-7.8-7.2-7.8s-7.2,3.5-7.2,7.8c0,0.1,0,0.1,0,0.2    c-0.1,0-0.1,0-0.2,0c-0.6,0.2-0.8,1.1-0.5,2.1c0.3,1,1,1.6,1.6,1.5c0.2,0.4,0.4,0.8,0.7,1.1c0.5,2.9,2.8,5.8,5.6,5.8    c2.8,0,5.1-3,5.6-5.8c0.3-0.3,0.5-0.7,0.7-1.1c0.6,0.1,1.2-0.5,1.5-1.5C16.5,13.5,16.3,12.6,15.7,12.4z"
            ></path><path
                fill="#242528"
                d="M8.4,1.3c0.3-0.3,0.6-0.6,1-0.8c1.3-0.5,2.8,0.3,3,1.5c0.1,0.5,0,1-0.4,1.5c-1.2,1.6-2.4,3.1-3.6,4.7    c0,0,0,0-0.1,0.1c0,0-0.1-0.1-0.1-0.1C7.2,6.7,6,5.1,4.8,3.6C3.9,2.4,4.5,0.7,6.1,0.4C7,0.3,7.7,0.5,8.3,1.2    C8.4,1.2,8.4,1.2,8.4,1.3z"
            ></path><path
                fill="#fff"
                d="M8.4,8.8L8.2,8.5C8.1,8.5,8.1,8.4,8.1,8.4L7.3,7.5C6.4,6.3,5.4,5,4.5,3.8C4,3.2,3.9,2.3,4.2,1.6    c0.3-0.8,1-1.3,1.9-1.5C7-0.1,7.8,0.1,8.4,0.7C8.7,0.5,9,0.3,9.3,0.2c0.7-0.3,1.6-0.2,2.3,0.2c0.6,0.4,1.1,1,1.2,1.6    c0.1,0.6,0,1.2-0.5,1.8L8.4,8.8z M6.6,0.8c-0.1,0-0.3,0-0.4,0c-0.6,0.1-1.1,0.5-1.3,1C4.7,2.4,4.8,2.9,5.1,3.4C6,4.6,7,5.8,7.9,7    l0.5,0.7l3.4-4.4c0.3-0.4,0.4-0.8,0.3-1.2C12,1.7,11.7,1.3,11.3,1c-0.5-0.3-1.1-0.3-1.7-0.1C9.2,1,9,1.2,8.7,1.5L8.5,1.9L8,1.4    C7.6,1,7.2,0.8,6.6,0.8z"
            ></path><path
                fill="#242528"
                d="M2.4,5.4C2.5,5.2,2.7,5.1,2.9,5c0.6-0.2,1.4,0.1,1.5,0.8c0,0.3,0,0.5-0.2,0.7C3.6,7.3,3,8,2.4,8.8    c0,0,0,0,0,0c0,0,0,0,0,0C1.8,8,1.2,7.3,0.6,6.5C0.1,5.9,0.5,5.1,1.2,5C1.7,4.9,2,5,2.4,5.4C2.3,5.3,2.4,5.4,2.4,5.4z"
            ></path><path
                fill="#fff"
                d="M2.4,9.4L2,9L0.3,6.8C0,6.4-0.1,5.9,0.1,5.5C0.3,5,0.7,4.7,1.2,4.6c0.5-0.1,0.9,0,1.2,0.3    c0.1-0.1,0.2-0.2,0.4-0.2c0.4-0.2,0.9-0.1,1.3,0.1C4.4,5,4.7,5.3,4.8,5.7c0.1,0.4,0,0.7-0.3,1L2.4,9.4z M1.5,5.3    c-0.1,0-0.1,0-0.2,0c-0.2,0-0.4,0.2-0.5,0.4c-0.1,0.2,0,0.4,0.1,0.6l1.5,1.9l1.5-2C4,6.1,4,6,4,5.8c0-0.2-0.1-0.3-0.3-0.4    C3.5,5.3,3.2,5.3,3,5.4C2.9,5.4,2.8,5.5,2.7,5.6L2.4,6L2.1,5.6C1.9,5.4,1.7,5.3,1.5,5.3z"
            ></path><path
                fill="#242528"
                d="M14.4,5.4c0.1-0.2,0.3-0.3,0.5-0.4c0.6-0.2,1.4,0.1,1.5,0.8c0,0.3,0,0.5-0.2,0.7C15.6,7.3,15,8,14.4,8.8    c0,0,0,0,0,0c0,0,0,0,0,0c-0.6-0.8-1.2-1.5-1.8-2.3c-0.5-0.6-0.1-1.4,0.6-1.6C13.7,4.9,14,5,14.4,5.4C14.3,5.3,14.4,5.4,14.4,5.4z    "
            ></path><path
                fill="#fff"
                d="M14.4,9.4L14,9l-1.8-2.3c-0.3-0.4-0.4-0.9-0.2-1.3c0.2-0.4,0.6-0.8,1.1-0.9c0.5-0.1,0.9,0,1.2,0.3    c0.1-0.1,0.2-0.2,0.4-0.2c0.4-0.2,0.9-0.1,1.3,0.1c0.4,0.2,0.6,0.6,0.7,0.9c0.1,0.4,0,0.7-0.3,1L14.4,9.4z M13.5,5.3    c-0.1,0-0.1,0-0.2,0c-0.2,0-0.4,0.2-0.5,0.4c-0.1,0.2,0,0.4,0.1,0.6l1.5,1.9l1.5-2C16,6.1,16,6,16,5.8c0-0.2-0.1-0.3-0.3-0.4    c-0.2-0.1-0.5-0.1-0.7-0.1c-0.1,0.1-0.3,0.1-0.3,0.3L14.4,6l-0.3-0.4C13.9,5.4,13.7,5.3,13.5,5.3z"
            ></path><path
                fill="#242528"
                d="M11.2,15.1L11.2,15.1c0,1-0.2,1.7-0.7,2.2S9.4,18,8.6,18S7,17.7,6.4,17.2s-0.8-1.3-0.8-2.3v-2.5     c0-1,0.3-1.8,0.8-2.3s1.2-0.8,2-0.8c0.9,0,1.6,0.2,2.1,0.7s0.7,1.2,0.7,2.2l0,0H9.6c0-0.6-0.1-1-0.2-1.2s-0.5-0.4-0.9-0.4     c-0.4,0-0.7,0.1-0.9,0.4c-0.2,0.3-0.3,0.7-0.3,1.3v2.6c0,0.6,0.1,1,0.3,1.3c0.2,0.3,0.5,0.4,0.9,0.4c0.4,0,0.7-0.1,0.8-0.3     s0.2-0.6,0.2-1.2H11.2z"
            ></path></svg
        >
    {:else if effect === "deafened"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon"
            ><path
                fill="#242528"
                d="M11.28,6.07a1.92,1.92,0,0,0-3-.39,1.56,1.56,0,0,0-.19,2,5.88,5.88,0,0,0,.81.86l2.44-2.43Z"
            ></path><path
                fill="#242528"
                d="M7.66,18.36a2.41,2.41,0,0,0,2.79-1.12,9.25,9.25,0,0,0,.74-1.64,16.06,16.06,0,0,1,2.34-4.43A8.22,8.22,0,0,0,15,8.09l-9,9A2.18,2.18,0,0,0,7.66,18.36Z"
            ></path><path
                fill="#fff"
                d="M14.53,2.62A6.29,6.29,0,0,0,11.64,1c-.46-.12-.93-.18-1.4-.27H9.5C8.91.82,8.32.9,7.74,1A5.09,5.09,0,0,0,4,5.18c0,.36,0,.66.45.71S5,5.69,5,5.33a3.82,3.82,0,0,1,3-3.24,9.8,9.8,0,0,1,2.52-.2,4.73,4.73,0,0,1,3,1.31C13.9,3,14.22,2.82,14.53,2.62Z"
            ></path><path
                fill="#fff"
                d="M15.24,8.09,15,8.35a8.44,8.44,0,0,1-1.44,2.83,16.06,16.06,0,0,0-2.34,4.43,9.25,9.25,0,0,1-.74,1.64,2.41,2.41,0,0,1-2.79,1.12,2.21,2.21,0,0,1-1.31-.8l-.86.67a3.14,3.14,0,0,0,1.68,1.12A3.42,3.42,0,0,0,11,18.27a8.1,8.1,0,0,0,1.14-2.19,17.26,17.26,0,0,1,2.29-4.34,12.38,12.38,0,0,0,1.14-1.85,6.8,6.8,0,0,0,.69-2.48A8.9,8.9,0,0,1,15.24,8.09Z"
            ></path><path
                fill="#fff"
                d="M8.25,5.68a1.92,1.92,0,0,1,2.62-.1c.28-.21.57-.41.86-.6a2.66,2.66,0,0,0-.79-.59,3.24,3.24,0,0,0-3.65.71C6.47,6,6.16,7.88,7.17,8.77l.07.07a8.05,8.05,0,0,1,1-.89c-.07-.08-.14-.15-.2-.23A1.56,1.56,0,0,1,8.25,5.68Z"
            ></path><path
                fill="#fff"
                d="M12.51,6.38a3.11,3.11,0,0,1,0,1.09,6.75,6.75,0,0,1-.62,1.83c-.14.3-.5.5-.76.75l-.22-.13a7.26,7.26,0,0,1,.41-1.16,2.55,2.55,0,0,0,.32-1.51L9.56,9.3a2,2,0,0,1,.33,1.8,9,9,0,0,1-.37,1.06l5.65-5.62a5,5,0,0,0-.65-2.18Z"
            ></path><path
                fill="#fff"
                d="M20.33,1.42,18.92,0l-3.6,3.58a6,6,0,0,1,.83,2Z"
            ></path><path
                fill="#fff"
                d="M6.78,13.72a1.2,1.2,0,0,1-.29-1.36L0,18.82l1.41,1.42,3.4-3.38a3.73,3.73,0,0,1-.07-.41c0-.17-.07-.4,0-.52a.94.94,0,0,1,.56-.42c.14,0,.31.24.45.41L7.66,14A1.13,1.13,0,0,1,6.78,13.72Z"
            ></path><path
                fill="#fff"
                d="M5.3,15.51a.94.94,0,0,0-.56.42c-.08.12,0,.34,0,.52a3.73,3.73,0,0,0,.07.41l.94-.94C5.61,15.75,5.44,15.5,5.3,15.51Z"
            ></path><path
                fill="#fff"
                d="M15.18,6.54l1-1a6,6,0,0,0-.83-2l-.79.79A5,5,0,0,1,15.18,6.54Z"
            ></path><path
                fill="#fff"
                d="M6.78,13.72a1.13,1.13,0,0,0,.89.29l1.86-1.85A9,9,0,0,0,9.9,11.1a2,2,0,0,0-.33-1.8L6.49,12.37A1.2,1.2,0,0,0,6.78,13.72Z"
            ></path><path
                fill="#fff"
                d="M11.33,8.75a7.26,7.26,0,0,0-.41,1.16l.22.13c.26-.25.62-.45.76-.75a6.75,6.75,0,0,0,.62-1.83,3.11,3.11,0,0,0,0-1.09l-.86.85A2.55,2.55,0,0,1,11.33,8.75Z"
            ></path><path
                fill="#242528"
                d="M14.53,4.36l.79-.79a5.93,5.93,0,0,0-.61-.8l-.77.76A5,5,0,0,1,14.53,4.36Z"
            ></path></svg
        >
    {:else if effect === "frightened"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="icon"
            ><ellipse fill="#fff" cx="8" cy="7.8" rx="7.2" ry="7.8"
            ></ellipse><path
                fill="#fff"
                d="M13.7,11.7c0,3.1-2.5,6.9-5.7,6.9s-5.7-3.8-5.7-6.9S4.8,7.2,8,7.2S13.7,8.5,13.7,11.7z"
            ></path><path
                fill="#242528"
                d="M6.4,8.9c0,0.9-0.7,1-1.5,1s-1.5-0.1-1.5-1S4,7.4,4.9,7.4S6.4,8.1,6.4,8.9z"
            ></path><path
                fill="#242528"
                d="M10.3,14.5c0,1.3-1,0-2.3,0s-2.3,1.3-2.3,0s1-2.3,2.3-2.3S10.3,13.2,10.3,14.5z"
            ></path><path
                fill="#242528"
                d="M12.4,8.9c0,0.9-0.7,1-1.5,1c-0.9,0-1.5-0.1-1.5-1s0.7-1.5,1.5-1.5C11.8,7.4,12.4,8.1,12.4,8.9z"
            ></path><ellipse
                transform="matrix(0.2904 -0.9569 0.9569 0.2904 1.0307 21.1022)"
                fill="#fff"
                cx="14.7"
                cy="9.9"
                rx="1.9"
                ry="1.1"
            ></ellipse><ellipse
                transform="matrix(0.9569 -0.2904 0.2904 0.9569 -2.812 0.7634)"
                fill="#fff"
                cx="1.2"
                cy="9.9"
                rx="1.1"
                ry="1.9"
            ></ellipse></svg
        >
    {:else if effect === "grappled"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="icon"
            ><path
                fill="#fff"
                d="M10.5,9.5c0,0,1.5-1.6,0.9-2.6c-0.6-1-2.3-2.6-2.3-3S8.6,0.3,8.1,0S7.2,1.4,7.6,2.8S6.6,2.9,6.4,2.6   C6.2,2.2,4.6,0,4.1,0.4s0,1.1,0.4,1.6c0.4,0.5,1.6,2,1.3,2.2c-0.2,0.2-4-3.1-4.5-2.7s-0.5,1,0.1,1.4s3.9,2.2,3.9,2.6S4.3,5.8,3,5.4   C1.7,4.9,0,5,0,5.5s5.4,2.2,6.1,2.7c0.8,0.4,0.3,1-0.2,1.1C5.5,9.5,4,10.6,3.7,11.3C3.4,12,4,12.4,4.4,12c0.3-0.4,2.4-1.6,3-1.4   C8,10.9,9.3,10.5,10.5,9.5z"
            ></path><polygon
                fill="#fff"
                points="11.4,6.9 21.6,13.7 18.5,17.3 8.5,9.2  "
            ></polygon><path
                fill="#fff"
                stroke="#242528"
                d="M10.6,19.1c-1.2-0.9-2.5-1.8-3.7-2.8c0.1-0.1,1.5-2,1.5-2.1c0.5-0.6,1-1.2,1.4-1.9c0-0.1,0.1-0.2,0.1-0.3   c-0.2-1.2-0.4-2.4-0.5-3.6c-0.1-0.6,0.2-1,0.8-1c0.4-0.1,0.8-0.1,1.2-0.2c0.1,0,0.1,0,0.2,0c0.2,0,0.2,0.2,0.2,0.3   c-0.1,0.2-0.3,0.5-0.4,0.7c-0.1,0.2-0.1,0.3,0,0.3c0.1,0.1,0.2,0,0.3-0.1c0.3-0.4,0.6-0.9,0.9-1.3c0.5-0.6,1.3-0.5,1.6,0.2   c0.1,0.2,0.2,0.2,0.3,0.1c0.1,0,0.1-0.1,0.2-0.1c0.3-0.1,0.7-0.1,1,0.1c0.3,0.2,0.4,0.5,0.3,0.9c0,0.3,0,0.4,0.3,0.4   c0.7,0.1,0.9,0.7,0.7,1.3c-0.1,0.2,0,0.4,0.2,0.6c0.1,0.1,0.1,0.1,0.2,0.2c0.3,0.3,0.5,0.7,0.2,1.1c-0.6,0.9-1.4,1.6-2.4,2.1   c-0.4,0.2-0.8,0.2-1.2,0.2c-0.1,0-0.2,0-0.3,0.1c-0.6,0.9-1.3,1.9-2,2.8C11.9,17.3,10.6,19.1,10.6,19.1z"
            ></path></svg
        >
    {:else if effect === "incapacitated"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon"
            ><path
                fill="#fff"
                d="M17.8,13.1c0,0-0.1,0-0.1,0c0-0.1,0-0.1,0-0.2c0-4.3-3.2-7.8-7.2-7.8s-7.2,3.5-7.2,7.8c0,0.1,0,0.1,0,0.2    c-0.1,0-0.1,0-0.2,0c-0.6,0.2-0.8,1.1-0.5,2.1c0.3,1,1,1.6,1.6,1.5c0.2,0.4,0.4,0.8,0.7,1.1c0.5,2.9,2.8,5.8,5.6,5.8    c2.8,0,5.1-3,5.6-5.8c0.3-0.3,0.5-0.7,0.7-1.1c0.6,0.1,1.2-0.5,1.5-1.5C18.5,14.2,18.3,13.2,17.8,13.1z"
            ></path><path fill="#242528" d="M11.3,18.9H9.6v-8.5h1.7V18.9z"
            ></path><path
                fill="#fff"
                d="M8.8,10.8c-1.5,0-3-0.1-4.6-0.2c-0.2,0-0.4-0.2-0.3-0.4c0-0.2,0.2-0.4,0.4-0.3c4.9,0.5,8.9,0.2,13.9-0.8    c1-0.2,1.5-0.5,1.6-0.8c0.1-0.2-0.1-0.5-0.3-0.7c-0.3-0.2-0.7-0.4-1.1-0.6c-0.4-0.2-0.9-0.4-1.4-0.5c-0.2,0.2-0.5,0.5-0.8,0.7    c-1.1,0.7-2.4,0.9-3.6,1.1C9,8.6,5.2,8.4,1.6,7.5C1,7.4,0.2,7.1,0,6.4c-0.1-0.4,0.2-0.9,0.7-1.2C1,5,1.5,4.9,1.9,4.8    c0.9-0.2,1.8-0.3,2.7-0.4C4.4,4.3,4.2,4.2,4,4.1C3.7,3.9,3.4,3.8,3.1,3.5C2.8,3.2,2.7,2.7,3,2.3c0.3-0.4,0.8-0.5,1.3-0.6    c3.2-0.3,6.4-0.2,9.5,0.3c0.2,0,0.5,0.1,0.7,0.1c0,0,0,0-0.1,0c-0.5-0.3-1-0.5-1.6-0.6c-2-0.5-4.2-0.8-6.3-0.8c0,0,0,0,0,0    c-0.2,0-0.4-0.2-0.4-0.4C6.2,0.1,6.4,0,6.7,0c2.2,0,4.3,0.3,6.4,0.8c0.6,0.2,1.2,0.4,1.8,0.7c0.5,0.3,0.8,0.7,1,1.1    c0.9,0.4,1.5,0.9,1.8,1.5c0.2,0.5,0.2,1.2-0.1,1.7c0.4,0.1,0.8,0.3,1.2,0.5C19.2,6.5,19.6,6.7,20,7c0.5,0.4,0.7,0.9,0.5,1.4    c-0.2,0.9-1.4,1.2-2.2,1.4C14.9,10.5,11.9,10.8,8.8,10.8z M6.5,5C5,5,3.5,5.2,2,5.5c-0.3,0.1-0.7,0.2-1,0.3    C0.9,5.9,0.7,6.1,0.8,6.2c0,0.1,0.2,0.3,1,0.6C5.3,7.6,9,7.9,12.6,7.4c1.1-0.1,2.4-0.4,3.3-0.9c0.1-0.1,0.3-0.2,0.4-0.3    c-1-0.3-2.1-0.6-3.2-0.8c-0.3,0-0.6,0.1-0.9,0.1C10.3,5.6,8.3,5.4,6.5,5z M14.6,4.9c0.7,0.2,1.5,0.4,2.2,0.6    c0.2-0.4,0.3-0.8,0.1-1.2c-0.2-0.4-0.5-0.7-1-0.9C15.8,4,15.3,4.6,14.6,4.9C14.6,4.9,14.6,4.9,14.6,4.9z M7.8,4.2    c1.8,0,3.5,0.2,5.2,0.5c0.4-0.1,0.8-0.2,1.2-0.4c0.6-0.3,0.9-0.7,0.9-1.1c-0.4-0.1-0.9-0.3-1.5-0.4c-3.1-0.5-6.2-0.6-9.3-0.3    c-0.4,0-0.7,0.1-0.8,0.2c0,0.1,0,0.2,0.1,0.3c0.1,0.2,0.4,0.3,0.6,0.4C5,3.7,5.8,4,6.6,4.2C7,4.2,7.4,4.2,7.8,4.2z"
            ></path></svg
        >
    {:else if effect === "invisible"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon"
            ><path
                fill="#242528"
                d="M19.63,17.73c-.92-.29-4.07-1.39-5-1.71a1.56,1.56,0,0,1-1.13-1.32,1.4,1.4,0,0,1-.06-.29,1,1,0,0,1,.08-.38c.17-.34.39-.66.53-1,.2-.52.35-1.05.52-1.59.28.11.47-.06.6-.3A5.48,5.48,0,0,0,16,8.26a.6.6,0,0,0-.16-.42c-.24-.18-.19-.37-.14-.59s0-.23.06-.35a8.3,8.3,0,0,0,0-3A2.23,2.23,0,0,0,14.7,2.22a4,4,0,0,1-1-.83A4.73,4.73,0,0,0,9.15.13,6.11,6.11,0,0,0,5.81,2.29,5.08,5.08,0,0,0,4.5,6a12.15,12.15,0,0,0,.21,1.34c-.5.12-.65.32-.65.85a1.94,1.94,0,0,0,0,.25,6.85,6.85,0,0,0,.62,2.15,3.7,3.7,0,0,0,.43.56.84.84,0,0,1,.19.3,6.81,6.81,0,0,0,1.07,2.7.39.39,0,0,1,.07.27c-.07.31-.16.61-.25.92a.61.61,0,0,1-.38.39,31.27,31.27,0,0,1-5,1.77c-.25.06-.49.17-.79.28.32.44.66,1.36,1,1.75H18.37Z"
            ></path><path
                fill="#fff"
                d="M6.7,1.4l-.12.1h0a10,10,0,0,0-.72.74H5.6l0,0h0l-.21.3.83.56A4.79,4.79,0,0,1,6.57,3a8.53,8.53,0,0,1,.8-.8L6.7,1.4ZM4.59,4.7q0,.13,0,.26h0a5.42,5.42,0,0,0,0,.89h0V6h0a4.83,4.83,0,0,0,.06.5h0v0h0v0h0v.06l1-.18a4.36,4.36,0,0,1-.08-.57,4.34,4.34,0,0,1,.08-1l-1-.2Zm.46,3.58-1,.05V8.4h0a7.1,7.1,0,0,0,.43,1.73h0l0,.09.92-.39a6,6,0,0,1-.41-1.59ZM6.4,11.77l-1,.25q.06.22.12.43h0v0h0v0h.07a6.51,6.51,0,0,0,.27.63h0v0H6l.18.31.85-.53a5.57,5.57,0,0,1-.65-1.56Zm-.48,3.88,0,0h0l0,0H5.63l-1.09.46H4.39l-.31.12.36.93c.58-.22,1.18-.47,1.78-.74l.21-.11-.51-.86ZM2.19,17.08q-.66.21-1.34.38H.54l-.26.1.36.93A3.65,3.65,0,0,1,1,18.44c.48-.12,1-.26,1.45-.41l-.3-1ZM2.7,18.5H1v.63H1v0l-.19.12a2,2,0,0,0,.18.25H2.7v-1Zm4,0h-2v1h2v-1Zm4,0h-2v1h2v-1Zm4,0h-2v1h2v-1Zm3.67,0v.6h0v-.6H16.7v1h1.69l.17-.24-.19-.14v-.6ZM17.59,17l-.33.95,1.76.6.31-.44.15-.46-.56-.19L17.59,17Zm-3.68-1.5-.74.67a2.76,2.76,0,0,0,1.15.75l1.05.37.33-.94-.28-.1L14.66,16h-.15l0,0h0a1.64,1.64,0,0,1-.54-.39Zm-.39-4,0,.05c-.11.36-.22.71-.34,1a4,4,0,0,1-.25.48l0,.07.87.5v0h0l0,0a5.34,5.34,0,0,0,.28-.53h.06c.13-.34.23-.68.34-1h0v0l-1-.29ZM15,8.45A4.12,4.12,0,0,1,14.64,10l.92.38A5.15,5.15,0,0,0,16,8.51H15Zm.88-3.87-1,.09a8,8,0,0,1-.07,1.77l1,.13c0-.23.06-.46.07-.69h0v0h0v0h0v0h0v0h0v0h0v0h0v0h0v0h0v0h0v0h0V5h0V5h0V5h0v0h0v0h0v0h0q0-.15,0-.3ZM13.73,1.44,13,2.15a4.69,4.69,0,0,0,1.23,1,.62.62,0,0,1,.22.19l.8-.6-.12-.15h-.72a4.84,4.84,0,0,1-.7-.61ZM10.35,0A6,6,0,0,0,9.21.12H9.14a4.71,4.71,0,0,0-.52.14H8.56L8.4.35l.36.93a3.73,3.73,0,0,1,.6-.17,5.07,5.07,0,0,1,1-.11h0a3.65,3.65,0,0,1,1.36.25l.37-.93A4.57,4.57,0,0,0,10.57,0h-.22Z"
            ></path></svg
        >
    {:else if effect === "paralyzed"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="icon"
            ><path
                fill="#fff"
                d="M17.5,12.6c0,0-0.1,0-0.1,0c0-0.1,0-0.1,0-0.2c0-4.3-3.2-7.8-7.2-7.8S3,8.1,3,12.4c0,0.1,0,0.1,0,0.2   c-0.1,0-0.1,0-0.2,0c-0.6,0.2-0.8,1.1-0.5,2.1c0.3,1,1,1.6,1.6,1.5c0.2,0.4,0.4,0.8,0.7,1.1c0.5,2.9,2.8,5.8,5.6,5.8   c2.8,0,5.1-3,5.6-5.8c0.3-0.3,0.5-0.7,0.7-1.1c0.6,0.1,1.2-0.5,1.5-1.5C18.3,13.8,18.1,12.8,17.5,12.6z"
            ></path><path
                fill="#242528"
                d="M9.5,15v2.6H8v-7.3h2.5c0.7,0,1.3,0.2,1.7,0.6c0.4,0.4,0.6,1,0.6,1.7c0,0.7-0.2,1.3-0.6,1.7    c-0.4,0.4-1,0.6-1.7,0.6H9.5z M9.5,13.8h1.1c0.3,0,0.5-0.1,0.7-0.3c0.2-0.2,0.2-0.5,0.2-0.9c0-0.3-0.1-0.6-0.2-0.9    c-0.2-0.2-0.4-0.3-0.7-0.3H9.5V13.8z"
            ></path><polygon
                fill="#242528"
                points="5.1,8.8 8.3,5.6 5.1,2.4 7,0.5 10.2,3.7 13.4,0.5 15.3,2.4 12.1,5.6 15.3,8.8 13.4,10.7 10.2,7.5     7,10.7   "
            ></polygon><polygon
                stroke="#fff"
                fill="#242528"
                points="5.1,8.8 8.3,5.6 5.1,2.4 7,0.5 10.2,3.7 13.4,0.5 15.3,2.4 12.1,5.6 15.3,8.8 13.4,10.7 10.2,7.5     7,10.7   "
            ></polygon><polygon
                fill="#242528"
                points="0.5,10.8 2,9.3 0.5,7.9 1.8,6.7 3.2,8.1 4.7,6.7 5.9,7.9 4.4,9.3 5.9,10.8 4.7,12 3.2,10.6 1.8,12       "
            ></polygon><polygon
                stroke="#fff"
                fill="#242528"
                points="0.5,10.8 2,9.3 0.5,7.9 1.8,6.7 3.2,8.1 4.7,6.7 5.9,7.9 4.4,9.3 5.9,10.8 4.7,12 3.2,10.6 1.8,12       "
            ></polygon><polygon
                fill="#242528"
                points="15.5,10.8 17,9.3 15.5,7.9 16.8,6.7 18.2,8.1 19.7,6.7 20.9,7.9 19.4,9.3 20.9,10.8 19.7,12     18.2,10.6 16.8,12   "
            ></polygon><polygon
                stroke="#fff"
                fill="#242528"
                points="15.5,10.8 17,9.3 15.5,7.9 16.8,6.7 18.2,8.1 19.7,6.7 20.9,7.9 19.4,9.3 20.9,10.8 19.7,12     18.2,10.6 16.8,12   "
            ></polygon></svg
        >
    {:else if effect === "petrified"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" class="icon"
            ><path
                fill="#fff"
                d="M8.1,6.4L7,4.9l1.1-0.6c0.1-0.1,0.2-0.1,0.2-0.2c0-0.1,0-0.2,0-0.3L6.4,0.2C6.9,0.1,7.4,0,8,0   c3.3,0,6.1,2.4,6.9,5.8l-2.8-0.9c-0.1,0-0.2,0-0.3,0L8.1,6.4z"
            ></path><path
                fill="#fff"
                d="M4.5,11.4l-1.9,2.4c-0.1-0.3-0.2-0.6-0.2-1c-0.3-0.4-0.5-0.7-0.7-1.1c-0.6,0.2-1.3-0.5-1.5-1.5   c-0.3-1-0.1-1.9,0.5-2.1c0.1,0,0.1,0,0.2,0c0-0.1,0-0.1,0-0.2c0-3.5,2.1-6.4,4.9-7.4l1.8,3.4L6.3,4.4c0,0-0.1,0-0.1,0.1L4.4,5.4   C4.2,5.5,4.2,5.6,4.2,5.7L4.5,11.4z"
            ></path><path
                fill="#fff"
                d="M7.9,16.9c0.1,0.5,0.2,1.1,0.3,1.6c-0.1,0-0.2,0-0.3,0c-2.2,0-4.1-1.9-5-4l2.3-2.8c0-0.1,0.1-0.2,0.1-0.3   L4.9,5.9l1.4-0.7l1.3,1.9C7.7,7.2,7.9,7.3,8,7.3c0.1,0,0.1,0,0.2,0l3.9-1.6l3,1c0.1,0.4,0.1,0.8,0.1,1.2c0,0.1,0,0.1,0,0.2   c0.1,0,0.1,0,0.1,0c0.4,0.1,0.6,0.6,0.6,1.1L10.3,11c-0.1,0-0.2,0.1-0.2,0.2c0,0.1,0,0.2,0,0.3l1.6,3.1l-3.5,1.9   C8,16.6,7.9,16.8,7.9,16.9z"
            ></path><path
                fill="#242528"
                d="M6.4,8.9c0,0.9-0.7,1-1.5,1s-1.5-0.1-1.5-1c0-0.9,0.7-1.5,1.5-1.5S6.4,8.1,6.4,8.9z"
            ></path><path
                fill="#242528"
                d="M10.3,14.5c0,1.3-1,0-2.3,0s-2.3,1.3-2.3,0s1-2.3,2.3-2.3S10.3,13.2,10.3,14.5z"
            ></path><path
                fill="#242528"
                d="M12.4,8.9c0,0.9-0.7,1-1.5,1s-1.5-0.1-1.5-1c0-0.9,0.7-1.5,1.5-1.5S12.4,8.1,12.4,8.9z"
            ></path><path
                fill="#fff"
                d="M10.9,11.6l4.9-1.6c0,0.1,0,0.1,0,0.1c-0.3,1-1,1.6-1.5,1.5c-0.2,0.4-0.4,0.8-0.7,1.1   c-0.4,2.5-2.2,5.1-4.6,5.7h0c-0.1-0.4-0.1-0.8-0.2-1.4l3.6-1.9c0.2-0.1,0.2-0.3,0.2-0.5L10.9,11.6z"
            ></path></svg
        >
    {:else if effect === "poisoned"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" class="icon"
            ><path
                fill="#fff"
                d="M15.3,8.1c0,0-0.1,0-0.1,0c0-0.1,0-0.1,0-0.2C15.2,3.5,11.9,0,8,0S0.8,3.5,0.8,7.8c0,0.1,0,0.1,0,0.2    c-0.1,0-0.1,0-0.2,0c-0.6,0.2-0.8,1.1-0.5,2.1c0.3,1,1,1.6,1.6,1.5c0.2,0.4,0.4,0.8,0.7,1.1c0.5,2.9,2.8,5.8,5.6,5.8    c2.8,0,5.1-3,5.6-5.8c0.3-0.3,0.5-0.7,0.7-1.1c0.6,0.1,1.2-0.5,1.5-1.5C16.1,9.2,15.9,8.2,15.3,8.1z"
            ></path><path
                fill="#242528"
                d="M9.9,9l-0.3,1L9,10.6c-0.1,0.2-0.3,0.4-0.4,0.5c-0.2,0.1-0.4,0.2-0.6,0.2c-0.5,0-0.9-0.2-1.1-0.6l-0.6-0.5     L6,9l0.4-0.1c0,0.1,0.1,0.2,0.1,0.2C6.6,9.5,6.8,9.8,7,9.9c0.2,0.1,0.5,0.2,0.9,0.2c0.5,0,0.8-0.1,1-0.2c0.2-0.1,0.4-0.4,0.5-0.7     c0-0.1,0.1-0.1,0.1-0.2L9.9,9z"
            ></path><path
                fill="#fff"
                d="M7.9,11.5c-0.6,0-1-0.3-1.3-0.7l-0.6-0.5c0,0-0.1-0.1-0.1-0.1l-0.3-1c0-0.1,0-0.1,0-0.2     c0-0.1,0.1-0.1,0.2-0.1l0.4-0.1c0.1,0,0.2,0,0.3,0.1l0.1,0.2C6.8,9.5,7,9.6,7.1,9.7c0.1,0.1,0.3,0.1,0.8,0.1     c0.6,0,0.8-0.1,0.9-0.1C8.9,9.6,9,9.5,9.2,9.1l0.1-0.2c0-0.1,0.2-0.2,0.3-0.1L10,8.8c0.1,0,0.1,0.1,0.2,0.1c0,0.1,0,0.1,0,0.2     l-0.3,1c0,0,0,0.1-0.1,0.1l-0.6,0.5c-0.1,0.2-0.3,0.4-0.5,0.5C8.5,11.4,8.2,11.5,7.9,11.5z M6.5,9.9L7,10.4c0,0,0,0,0.1,0.1     C7.3,10.8,7.5,11,7.9,11c0.2,0,0.4,0,0.5-0.1c0.1-0.1,0.3-0.2,0.3-0.4c0,0,0-0.1,0.1-0.1l0.6-0.5l0.1-0.3C9.4,9.9,9.2,10,9,10.1     c-0.2,0.1-0.6,0.2-1.1,0.2c-0.5,0-0.8-0.1-1.1-0.2C6.7,10,6.5,9.9,6.4,9.6L6.5,9.9z"
            ></path><path
                fill="#242528"
                d="M8,12.2c0.4-0.2,1.2-0.6,2.3-1.1c0.1,0,0.2-0.1,0.4-0.2c0.4-0.4,0.7-0.7,1-0.9c0.3-0.2,0.4-0.3,0.6-0.3      c0.1,0,0.3,0,0.3,0.1c0.1,0.1,0.1,0.2,0.1,0.4c0,0.2,0,0.4-0.1,0.7c0.3,0.4,0.4,0.6,0.4,0.8c0,0.2,0,0.3-0.1,0.3      c-0.1,0.1-0.2,0.1-0.4,0.1c-0.1,0-0.2,0-0.4-0.1c-0.2-0.1-0.4-0.2-0.6-0.4c-0.6,0.1-1.5,0.5-2.7,1.1c0.2,0.1,0.3,0.2,0.3,0.2      c0.4,0.2,0.9,0.5,1.5,0.9c0.1,0,0.2,0.2,0.5,0.3c1.2,0.1,1.9,0.5,1.9,0.9c0,0.3-0.3,0.5-1,0.6c-0.3,0.4-0.6,0.6-0.8,0.6      c-0.2,0-0.5-0.3-0.7-1c0-0.1-0.1-0.2-0.1-0.3c-1-0.8-1.8-1.4-2.6-1.8c-0.9,0.5-1.8,1.2-2.6,1.9C5.2,16,5,16.4,4.6,16.4      c-0.2,0-0.5-0.2-0.8-0.7c-0.7,0-1-0.2-1-0.6c0-0.3,0.1-0.5,0.4-0.6c0.3-0.1,0.8-0.3,1.6-0.4c0.6-0.5,1.4-0.9,2.2-1.4      c-1.2-0.6-2.1-0.9-2.8-1.1C4,11.8,3.9,12,3.7,12c-0.1,0.1-0.3,0.1-0.4,0.1c-0.2,0-0.3,0-0.4-0.1c-0.1-0.1-0.1-0.2-0.1-0.3      c0-0.1,0.2-0.4,0.5-0.8c-0.1-0.3-0.1-0.5-0.1-0.6c0-0.2,0-0.4,0.1-0.5c0.1-0.1,0.2-0.1,0.4-0.1C3.8,9.7,4,9.8,4.2,10      c0.3,0.2,0.6,0.5,0.9,0.9C6,11.2,6.9,11.6,8,12.2z"
            ></path><path
                fill="#fff"
                d="M11.3,16.6c-0.5,0-0.8-0.6-1-1.1c0-0.1,0-0.1-0.1-0.2c-0.9-0.7-1.7-1.3-2.4-1.7c-0.8,0.5-1.6,1.1-2.4,1.7      c-0.1,0.9-0.5,1.3-0.9,1.3c-0.3,0-0.6-0.2-0.9-0.7c-1,0-1.2-0.5-1.2-0.8c0-0.4,0.2-0.7,0.5-0.8c0.3-0.1,0.8-0.3,1.7-0.4      c0.5-0.4,1.1-0.8,1.8-1.1c-0.9-0.4-1.6-0.7-2.2-0.8c-0.2,0.1-0.3,0.2-0.4,0.3c-0.4,0.2-0.8,0.2-1.1,0c-0.1-0.1-0.2-0.2-0.2-0.5      c0-0.1,0.1-0.3,0.4-0.8c-0.1-0.2-0.1-0.4-0.1-0.6C2.9,10,3,9.8,3.1,9.7c0.2-0.2,0.6-0.4,1.3,0.1C4.7,10,5,10.3,5.3,10.7      C6.1,11,7,11.4,8,11.9c0.5-0.2,1.2-0.6,2.3-1c0,0,0.2-0.1,0.4-0.2c0.4-0.4,0.7-0.7,1-0.9c0.3-0.2,0.5-0.4,0.7-0.4      c0.3,0,0.4,0.1,0.5,0.2C13,9.8,13,10,13,10.2c0,0.2,0,0.3-0.1,0.6c0.3,0.4,0.4,0.7,0.4,0.9c0,0.2-0.1,0.4-0.2,0.5      c-0.1,0.1-0.3,0.2-0.5,0.2c-0.1,0-0.3,0-0.5-0.2c-0.2-0.1-0.3-0.2-0.6-0.3c-0.5,0.1-1.2,0.4-2.1,0.8c0.4,0.2,0.9,0.5,1.5,0.9      c0.1,0,0.2,0.1,0.5,0.3c0.6,0.1,2,0.3,2,1.2c0,0.4-0.4,0.7-1.1,0.9C11.9,16.4,11.6,16.6,11.3,16.6z M7.9,13c0,0,0.1,0,0.1,0      c0.8,0.4,1.7,1,2.6,1.8c0,0,0.1,0.1,0.1,0.1c0.1,0.1,0.1,0.2,0.1,0.3c0.3,0.8,0.5,0.8,0.5,0.8c0,0,0.2,0,0.6-0.5      c0,0,0.1-0.1,0.2-0.1c0.5-0.1,0.8-0.2,0.8-0.4c0-0.3-0.6-0.6-1.6-0.7c0,0-0.1,0-0.1,0c-0.3-0.2-0.4-0.3-0.5-0.3      c-0.6-0.4-1.1-0.7-1.5-0.9L8.8,13c-0.1,0-0.1-0.1-0.1-0.2c0-0.1,0.1-0.2,0.1-0.2c1.2-0.6,2.1-1,2.8-1.1c0.1,0,0.1,0,0.2,0      c0.3,0.2,0.5,0.3,0.6,0.4c0.2,0.1,0.3,0.1,0.3,0.1c0.1,0,0.2,0,0.2,0c0,0,0-0.1,0-0.2c0,0,0-0.2-0.4-0.7c0-0.1-0.1-0.1-0.1-0.2      c0-0.3,0.1-0.5,0.1-0.6c0-0.2,0-0.2-0.1-0.3c0,0,0,0-0.1,0c0,0-0.1,0-0.4,0.3c-0.2,0.2-0.6,0.5-1,0.9c0,0-0.1,0-0.1,0.1      c-0.2,0.1-0.4,0.2-0.4,0.2c-1.1,0.5-1.9,0.8-2.3,1.1c-0.1,0-0.2,0-0.2,0c-1.1-0.6-2-1-2.8-1.3c0,0-0.1,0-0.1-0.1      c-0.3-0.4-0.6-0.7-0.9-0.9C3.8,9.9,3.7,9.9,3.6,9.9c-0.1,0-0.2,0-0.2,0.1c0,0-0.1,0.1-0.1,0.3c0,0.1,0,0.3,0.1,0.6      c0,0.1,0,0.1,0,0.2C3.1,11.6,3,11.7,3,11.7c0,0.1,0,0.1,0,0.1c0.1,0.1,0.3,0.1,0.5,0c0.1-0.1,0.3-0.2,0.4-0.3      c0.1,0,0.1-0.1,0.2-0.1C5,11.6,6,11.9,7.2,12.5c0.1,0,0.1,0.1,0.1,0.2c0,0.1,0,0.2-0.1,0.2c-0.8,0.5-1.6,0.9-2.2,1.4      c0,0-0.1,0-0.1,0c-1,0.1-1.4,0.3-1.6,0.4C3.1,14.8,3,14.9,3,15.1c0,0.2,0.3,0.3,0.8,0.3c0.1,0,0.2,0,0.2,0.1      c0.3,0.5,0.5,0.5,0.6,0.5c0.2,0,0.4-0.3,0.5-0.9c0-0.1,0-0.1,0.1-0.1c0.8-0.7,1.7-1.4,2.7-1.9C7.8,13.1,7.9,13,7.9,13z"
            ></path><path
                fill="#242528"
                d="M10.5,2.4C9.9,1.9,9,1.6,7.9,1.6S6,1.9,5.3,2.4c-0.7,0.6-1,1.3-1,2.2c0,0.8,0.1,1.4,0.3,1.7      c0.3,0.5,0.4,0.8,0.4,1l0.1,0.9l1.4,0.7l0.2,0.5c0.1,0,0.3,0.1,0.5,0.1c0.2,0,0.4,0,0.6,0c0.4,0,0.8,0,1.1-0.1l0.2-0.5l1.4-0.7      l0.1-0.9c0-0.2,0.1-0.3,0.1-0.4c0.4-0.8,0.7-1.5,0.7-2.3C11.5,3.8,11.2,3,10.5,2.4z M6.4,7.3c-0.6,0-0.9-0.3-0.9-1      c0-0.3,0.1-0.6,0.2-0.7c0.1-0.2,0.4-0.2,0.7-0.2c0.6,0,0.8,0.3,0.8,0.9C7.3,7,7,7.3,6.4,7.3z M8.2,8.7c-0.1,0-0.2,0-0.2-0.1      C7.9,8.7,7.8,8.7,7.7,8.7c-0.1,0-0.2,0-0.3-0.1C7.4,8.6,7.3,8.5,7.3,8.4c0-0.1,0.1-0.2,0.2-0.4C7.7,7.8,7.8,7.6,8,7.4      C8.1,7.6,8.2,7.8,8.4,8c0.2,0.2,0.2,0.3,0.2,0.4C8.6,8.6,8.5,8.7,8.2,8.7z M9.5,7.3c-0.6,0-0.9-0.3-0.9-1c0-0.6,0.3-0.9,0.9-0.9      c0.3,0,0.5,0.1,0.6,0.2c0.1,0.1,0.2,0.4,0.2,0.7C10.3,7,10,7.3,9.5,7.3z"
            ></path><path
                fill="#fff"
                d="M7.9,9.8c-0.2,0-0.4,0-0.6,0c-0.2,0-0.4-0.1-0.5-0.1c-0.1,0-0.1-0.1-0.2-0.1L6.5,9.1L5.1,8.4      C5,8.4,5,8.3,5,8.3L4.8,7.4c0-0.1-0.1-0.3-0.4-0.9c-0.2-0.4-0.4-1-0.4-1.8c0-1,0.4-1.8,1.1-2.4c0.7-0.6,1.6-0.9,2.8-0.9      c1.1,0,2.1,0.3,2.8,0.9l0,0c0.7,0.6,1.1,1.4,1.1,2.4c0,0.8-0.2,1.6-0.7,2.4c0,0,0,0.1-0.1,0.3l-0.1,0.9c0,0.1-0.1,0.2-0.1,0.2      L9.4,9.1L9.2,9.5c0,0.1-0.1,0.1-0.2,0.1C8.8,9.8,8.4,9.8,7.9,9.8z M7.1,9.2c0.1,0,0.2,0,0.3,0.1c0.2,0,0.4,0,0.6,0      c0.4,0,0.6,0,0.9-0.1L9,8.8C9,8.8,9,8.7,9.1,8.7L10.4,8l0.1-0.7c0-0.2,0.1-0.3,0.1-0.4c0.4-0.7,0.6-1.5,0.6-2.2      c0-0.8-0.3-1.5-0.9-2C9.7,2.1,8.9,1.8,7.9,1.8c-1,0-1.8,0.3-2.4,0.8c-0.6,0.5-0.9,1.2-0.9,2c0,0.7,0.1,1.3,0.3,1.6      c0.4,0.7,0.5,0.9,0.5,1.1L5.4,8l1.3,0.6c0.1,0,0.1,0.1,0.1,0.1L7.1,9.2z M8.2,9C8.1,9,8.1,9,8,8.9C7.7,9,7.4,9,7.3,8.8      C7.2,8.8,7.1,8.6,7.1,8.4c0-0.2,0.1-0.4,0.3-0.6c0.1-0.1,0.2-0.3,0.4-0.5c0-0.1,0.1-0.1,0.2-0.1c0,0,0,0,0,0      c0.1,0,0.2,0,0.2,0.1c0.1,0.2,0.2,0.4,0.4,0.5C8.8,8,8.8,8.2,8.8,8.4c0,0.2-0.1,0.3-0.2,0.4C8.6,8.9,8.4,9,8.2,9z M8,8.4      c0,0,0.1,0,0.1,0c0.1,0,0.1,0,0.1,0c0.1,0,0.1,0,0.1,0c0,0,0,0,0-0.1l0,0c0,0,0-0.1-0.2-0.3C8.1,8,8,8,8,7.9      C7.9,8,7.8,8,7.8,8.1C7.6,8.3,7.6,8.4,7.6,8.4c0,0.1,0,0.1,0.1,0.1c0,0,0,0,0.1,0C7.9,8.4,7.9,8.4,8,8.4z M9.5,7.6      c-0.4,0-1.1-0.2-1.1-1.2c0-0.8,0.4-1.2,1.1-1.2c0.3,0,0.6,0.1,0.8,0.3c0.2,0.2,0.3,0.5,0.3,0.8C10.6,7.4,9.9,7.6,9.5,7.6z       M9.5,5.7C9,5.7,8.9,5.9,8.9,6.3c0,0.6,0.3,0.7,0.6,0.7c0.3,0,0.6-0.1,0.6-0.8c0-0.2,0-0.4-0.1-0.5C9.9,5.7,9.7,5.7,9.5,5.7z       M6.4,7.6C6,7.6,5.3,7.4,5.3,6.3c0-0.4,0.1-0.7,0.3-0.9c0.2-0.2,0.5-0.3,0.8-0.3c0.7,0,1.1,0.4,1.1,1.1C7.5,7.4,6.8,7.6,6.4,7.6      z M6.5,5.7C6.2,5.7,6.1,5.7,6,5.8C5.9,5.9,5.8,6.1,5.8,6.3c0,0.6,0.3,0.7,0.6,0.7C6.7,7.1,7,7,7,6.3C7,5.8,6.9,5.7,6.5,5.7z"
            ></path></svg
        >
    {:else if effect === "prone"}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" class="icon"
            ><path
                fill="#fff"
                d="M13.72,15.63c-1.05.86-2,1.51-3.77,0s-3-3.71-4.52-3.77-5.21.75-5.4,0,.57-1.51,1.51-1.51S4.61,11,6.18,9.6s2.76-2.07,3-3.77S8.57.94,9.19.31s1.32-.25,1.51.75,1,5.27,0,7c0,0-.19,3.14.75,3.77,0,0,1.44-2.39,3-3S19.18,8,19,8.84s-.13,1.44-1.51,1.51-3.08.38-4.52,3a6.44,6.44,0,0,1,3-.75,4.28,4.28,0,0,1,3,3c.06.94-.63,1.88-1.51,1.51S16.79,13.11,13.72,15.63Z"
            ></path><ellipse
                fill="#fff"
                cx="5.72"
                cy="6.7"
                rx="1.88"
                ry="2.49"
                transform="translate(-2.03 2.51) rotate(-21.1)"
            ></ellipse></svg
        >
    {:else if effect === "restrained"}
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 18.82 21.16"
            class="icon"
            ><text
                stroke="#fff"
                style="font-size: 8px;"
                transform="translate(7 6.84)">R</text
            ><path
                fill="#fff"
                d="M18.75,10.61c-1.5,1.41-2.84,3.08-4.56,4.13-1.05.64-2.68.34-4,.46A7.14,7.14,0,0,1,13.8,7.39c.32-.15,1-.18,1.1,0a1.67,1.67,0,0,1,.21,1.33,14,14,0,0,1-1.61,2.17c2.2-.87,2.5-1.69,3-3.76.46-1.82,0-4.66.71-4.95.83,0,1.69-.33,1.57,1.26C18.59,6.18,18.75,7.85,18.75,10.61Z"
            ></path><path
                fill="#fff"
                d="M.07,10.61c1.5,1.41,2.84,3.08,4.56,4.13,1.05.64,2.68.34,4,.46A7.14,7.14,0,0,0,5,7.39c-.32-.15-1-.18-1.1,0C3.69,7.74,4.84,8.8,5,9.16c.28.62,0,1.12.32,1.73-3-1.23-2.5-1.69-3-3.76-.46-1.82,0-4.66-.71-4.95C.75,2.2-.11,1.84,0,3.43.23,6.18.07,7.85.07,10.61Z"
            ></path><path
                fill="#fff"
                d="M2.51,21.16c-.71-1.14-.56-2,.93-2q5.6-.07,11.19,0c1.49,0,1.64.83.93,2Z"
            ></path><path
                fill="#fff"
                d="M9.22,18.12c-1.92,0-3.85.06-5.76,0-.46,0-.89-.54-1.34-.82.45-.37.89-1,1.34-1.06,3.76-.08,7.52-.07,11.28,0,.41,0,.81.61,1.21.94-.41.32-.8.91-1.22.93C12.9,18.18,11.06,18.12,9.22,18.12Z"
            ></path></svg
        >
    {:else if effect === "stunned"}
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 18.7 23.2"
            class="icon"
            ><path
                fill="#fff"
                d="M16.6,12.7c0,0-0.1,0-0.1,0c0-0.1,0-0.1,0-0.2c0-4.3-3.2-7.8-7.2-7.8s-7.2,3.5-7.2,7.8c0,0.1,0,0.1,0,0.2   c-0.1,0-0.1,0-0.2,0c-0.6,0.2-0.8,1.1-0.5,2.1c0.3,1,1,1.6,1.6,1.5c0.2,0.4,0.4,0.8,0.7,1.1c0.5,2.9,2.8,5.8,5.6,5.8   c2.8,0,5.1-3,5.6-5.8c0.3-0.3,0.5-0.7,0.7-1.1c0.6,0.1,1.2-0.5,1.5-1.5C17.4,13.8,17.2,12.9,16.6,12.7z"
            ></path><path
                fill="#242528"
                d="M10.3,15.6c0-0.3-0.1-0.5-0.2-0.7s-0.4-0.3-0.8-0.5c-0.7-0.3-1.3-0.6-1.7-0.9C7.2,13.3,7,12.8,7,12.2    c0-0.6,0.2-1.1,0.7-1.4c0.4-0.4,1-0.6,1.7-0.6c0.7,0,1.2,0.2,1.7,0.6c0.4,0.4,0.6,0.9,0.6,1.6l0,0h-1.4c0-0.3-0.1-0.6-0.2-0.8    c-0.2-0.2-0.4-0.3-0.7-0.3c-0.3,0-0.5,0.1-0.7,0.3c-0.2,0.2-0.2,0.4-0.2,0.6c0,0.2,0.1,0.4,0.3,0.6s0.5,0.3,0.9,0.5    c0.7,0.2,1.2,0.5,1.5,0.9s0.5,0.8,0.5,1.4c0,0.6-0.2,1.1-0.6,1.5s-1,0.5-1.7,0.5c-0.7,0-1.3-0.2-1.8-0.6c-0.5-0.4-0.7-1-0.7-1.7    l0,0h1.4c0,0.4,0.1,0.8,0.3,1c0.2,0.2,0.5,0.3,0.9,0.3c0.3,0,0.5-0.1,0.7-0.2S10.3,15.9,10.3,15.6z"
            ></path><path
                stroke="#fff"
                fill="#242528"
                d="M7.9,3.1c0,0-1.7,0.2-2.8,0.3c-0.1,0-0.2,0.1-0.2,0.2c0,0.1,0,0.2,0.1,0.3C5.7,4.6,7,5.8,7,5.8     S6.6,7.5,6.4,8.6c0,0.1,0,0.2,0.1,0.3c0.1,0.1,0.2,0.1,0.3,0c1-0.6,2.5-1.4,2.5-1.4s1.5,0.8,2.5,1.4c0.1,0,0.2,0,0.3,0     c0.1-0.1,0.1-0.2,0.1-0.3c-0.2-1.1-0.6-2.8-0.6-2.8s1.3-1.1,2.1-1.9c0.1-0.1,0.1-0.2,0.1-0.3c0-0.1-0.1-0.2-0.2-0.2     c-1.1-0.1-2.8-0.3-2.8-0.3S10,1.6,9.5,0.5c0-0.1-0.1-0.2-0.2-0.2C9.2,0.4,9.1,0.4,9,0.5C8.6,1.6,7.9,3.1,7.9,3.1z"
            ></path><path
                stroke="#fff"
                fill="#242528"
                d="M15,7.2c0,0-1,0.1-1.6,0.2c-0.1,0-0.1,0-0.1,0.1c0,0.1,0,0.1,0,0.2c0.5,0.4,1.2,1.1,1.2,1.1s-0.2,1-0.3,1.6     c0,0.1,0,0.1,0.1,0.2c0.1,0,0.1,0,0.2,0c0.6-0.3,1.4-0.8,1.4-0.8s0.9,0.5,1.4,0.8c0.1,0,0.1,0,0.2,0c0.1,0,0.1-0.1,0.1-0.2     c-0.1-0.6-0.3-1.6-0.3-1.6s0.7-0.7,1.2-1.1c0,0,0.1-0.1,0-0.2s-0.1-0.1-0.1-0.1c-0.7-0.1-1.6-0.2-1.6-0.2s-0.4-0.9-0.7-1.5     c0-0.1-0.1-0.1-0.1-0.1c-0.1,0-0.1,0-0.1,0.1C15.4,6.3,15,7.2,15,7.2z"
            ></path><path
                stroke="#fff"
                fill="#242528"
                d="M2.1,7.2c0,0-1,0.1-1.6,0.2c-0.1,0-0.1,0-0.1,0.1c0,0.1,0,0.1,0,0.2c0.5,0.4,1.2,1.1,1.2,1.1     s-0.2,1-0.3,1.6c0,0.1,0,0.1,0.1,0.2c0.1,0,0.1,0,0.2,0C2.1,10.2,3,9.7,3,9.7s0.9,0.5,1.4,0.8c0.1,0,0.1,0,0.2,0     c0.1,0,0.1-0.1,0.1-0.2C4.5,9.7,4.3,8.7,4.3,8.7S5,8.1,5.5,7.6c0,0,0.1-0.1,0-0.2c0-0.1-0.1-0.1-0.1-0.1C4.8,7.3,3.8,7.2,3.8,7.2     S3.4,6.3,3.1,5.7C3.1,5.6,3,5.6,3,5.6c-0.1,0-0.1,0-0.1,0.1C2.6,6.3,2.1,7.2,2.1,7.2z"
            ></path></svg
        >
    {:else if effect === "unconscious"}
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 15.9 18.6"
            class="icon"
            ><path
                fill="#fff"
                d="M15.3,8.1c0,0-0.1,0-0.1,0c0-0.1,0-0.1,0-0.2C15.2,3.5,11.9,0,8,0S0.8,3.5,0.8,7.8c0,0.1,0,0.1,0,0.2   c-0.1,0-0.1,0-0.2,0c-0.6,0.2-0.8,1.1-0.5,2.1c0.3,1,1,1.6,1.6,1.5c0.2,0.4,0.4,0.8,0.7,1.1c0.5,2.9,2.8,5.8,5.6,5.8   c2.8,0,5.1-3,5.6-5.8c0.3-0.3,0.5-0.7,0.7-1.1c0.6,0.1,1.2-0.5,1.5-1.5C16.1,9.2,15.9,8.2,15.3,8.1z"
            ></path><path
                fill="#242528"
                d="M10.4,13.9c0,1.3-1,0-2.3,0s-2.3,1.3-2.3,0s1-2.3,2.3-2.3S10.4,12.6,10.4,13.9z"
            ></path><rect
                x="4.6"
                y="5.8"
                transform="matrix(-0.7071 0.7071 -0.7071 -0.7071 14.1626 10.267)"
                fill="#242528"
                width="0.7"
                height="4.5"
            ></rect><rect
                x="4.6"
                y="5.8"
                transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 2.7546 17.2743)"
                fill="#242528"
                width="0.7"
                height="4.5"
            ></rect><rect
                x="10.6"
                y="5.8"
                transform="matrix(-0.7071 0.7071 -0.7071 -0.7071 24.4054 6.0243)"
                fill="#242528"
                width="0.7"
                height="4.5"
            ></rect><rect
                x="10.6"
                y="5.8"
                transform="matrix(-0.7071 -0.7071 0.7071 -0.7071 12.9974 21.517)"
                fill="#242528"
                width="0.7"
                height="4.5"
            ></rect></svg
        >
    {:else}
        ?
    {/if}
</div>

<style>
    .icon {
        width: 1.25rem;
        height: 1.25rem;
    }
</style>
