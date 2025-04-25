<script lang="ts">
    import { fade } from "svelte/transition";
    import {
        MessageTypes,
        notifications,
        removeToast,
    } from "../notifications.svelte";
</script>

<div class="flex flex-col items-end gap-2 pointer-events-none">
    {#each notifications.notifications as notification (notification.id)}
        <div transition:fade|local>
            {#if notification.type === MessageTypes.Info}
                <button
                    onclick={() => {
                        removeToast(notification.id);
                    }}
                    class="alert alert-info alert-soft pointer-events-auto"
                >
                    <i class="fa-solid fa-circle-info text-lg"></i>
                    <span>{notification.msg}</span>
                </button>
            {:else if notification.type === MessageTypes.Neutral}
                <button
                    onclick={() => {
                        removeToast(notification.id);
                    }}
                    class="alert alert-soft pointer-events-auto"
                >
                    <i class="fa-solid fa-circle-info text-lg"></i>
                    <span>{notification.msg}</span>
                </button>
            {:else if notification.type === MessageTypes.Warning}
                <button
                    onclick={() => {
                        removeToast(notification.id);
                    }}
                    class="alert alert-warning alert-soft pointer-events-auto"
                >
                    <i class="fa-solid fa-triangle-exclamation text-lg"></i>
                    <span>{notification.msg}</span>
                </button>
            {:else if notification.type === MessageTypes.Error}
                <button
                    onclick={() => {
                        removeToast(notification.id);
                    }}
                    class="alert alert-error alert-soft pointer-events-auto"
                >
                    <i class="fa-solid fa-xmark text-lg"></i>
                    <span>{notification.msg}</span>
                </button>
            {:else if notification.type === MessageTypes.Scawy}
                <button
                    onclick={() => {
                        removeToast(notification.id);
                    }}
                    class="alert alert-error alert-soft pointer-events-auto"
                >
                    <i class="fa-solid fa-bolt"></i>
                    <span>{notification.msg}</span>
                </button>
            {:else if notification.type === MessageTypes.Success}
                <button
                    onclick={() => {
                        removeToast(notification.id);
                    }}
                    class="alert alert-success alert-soft pointer-events-auto"
                >
                    <i class="fa-solid fa-circle-check text-lg"></i>
                    <span>{notification.msg}</span>
                </button>
            {:else if notification.type === MessageTypes.Message}
                <button
                    onclick={() => {
                        removeToast(notification.id);
                    }}
                    class="chat chat-end pointer-events-auto"
                >
                    <div class="chat-header">notification.msg.sender</div>
                    <div class="chat-bubble">
                        {typeof notification.msg === "string"
                            ? notification.msg
                            : notification.msg.msg}
                    </div>
                </button>
            {/if}
        </div>
    {/each}
</div>
