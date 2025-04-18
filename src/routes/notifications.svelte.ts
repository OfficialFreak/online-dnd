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
    }

    return id;
}