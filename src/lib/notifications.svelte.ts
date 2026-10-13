export enum MessageTypes {
    Neutral,
    Info,
    Success,
    Warning,
    Error,
    Message,
    Scawy
}

export const notifications: {notifications: {id: string, msg: string | {msg: string, sender: string}, type: MessageTypes, removeAfter: number}[]} = $state({notifications: []});

/** How many notifications that don't go by themselves stay at most */
const MAX_LASTING = 8;

export function removeToast(id: string) {
    notifications.notifications = notifications.notifications.filter((notification) => notification.id !== id);
}

export function notify(msg: string | {msg: string, sender: string}, type: MessageTypes, removeAfter = 5000): string {
    let id = crypto.randomUUID();
    notifications.notifications.push({
        id: id,
        msg: msg,
        type: type,
        removeAfter: removeAfter
    });

    if (removeAfter > 0) {
        setTimeout(() => {
            removeToast(id);
        }, removeAfter);
    } else {
        // Those that stay, like the DM's rolls, only the latest few: they piled up over a
        // session, hundreds out of sight above the screen, the history keeps them anyway
        const lasting = notifications.notifications.filter((notification) => notification.removeAfter <= 0);
        if (lasting.length > MAX_LASTING) {
            const gone = new Set(lasting.slice(0, lasting.length - MAX_LASTING).map((notification) => notification.id));
            notifications.notifications = notifications.notifications.filter((notification) => !gone.has(notification.id));
        }
    }

    return id;
}