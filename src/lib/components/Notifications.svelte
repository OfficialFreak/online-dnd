<script lang="ts">
    import { fade } from "svelte/transition";
    import { MessageTypes, notifications } from "../../routes/notifications.svelte";
</script>

<div class="flex flex-col gap-2">
    {#each notifications.notifications as notification (notification.id)}
    <div transition:fade|local>
        {#if notification.type === MessageTypes.Info}
        <div role="alert" class="alert alert-info alert-soft">
            <i class="fa-solid fa-circle-info text-lg"></i>
            <span>{notification.msg}</span>
        </div>
        {:else if notification.type === MessageTypes.Neutral}
        <div role="alert" class="alert alert-soft">
            <i class="fa-solid fa-circle-info text-lg"></i>
            <span>{notification.msg}</span>
        </div>
        {:else if notification.type === MessageTypes.Warning}
        <div role="alert" class="alert alert-warning alert-soft">
            <i class="fa-solid fa-triangle-exclamation text-lg"></i>
            <span>{notification.msg}</span>
        </div>
        {:else if notification.type === MessageTypes.Error}
        <div role="alert" class="alert alert-error alert-soft">
            <i class="fa-solid fa-xmark text-lg"></i>
            <span>{notification.msg}</span>
        </div>
        {:else if notification.type === MessageTypes.Scawy}
        <div role="alert" class="alert alert-error alert-soft">
            <i class="fa-solid fa-bolt"></i>
            <span>{notification.msg}</span>
        </div>
        {:else if notification.type === MessageTypes.Success}
        <div role="alert" class="alert alert-success alert-soft">
            <i class="fa-solid fa-circle-check text-lg"></i>
            <span>{notification.msg}</span>
        </div>
        {:else if notification.type === MessageTypes.Message}
        <div class="chat chat-end">
            <div class="chat-header">
                notification.msg.sender
            </div>
            <div class="chat-bubble">{typeof notification.msg === "string" ? notification.msg : notification.msg.msg}</div>
        </div>
        {/if}
    </div>
    {/each}
</div>