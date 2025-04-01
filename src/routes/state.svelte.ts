export const userState = $state({
    ws: null,
    store: null,
    base_url: "localhost:3030"
});

export const gameState = $state({
    name: "Unknown Player",
    dm: false
});