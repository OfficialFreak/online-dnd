/**
 * The fog's texture, blurred once as the fog shows it: blurring the whole fog canvas after
 * every zoom took a sixth of a second. At half its size, as it is blurred anyway, and
 * wrapped around at the edges so the tiles meet without a seam. Made once for the app,
 * decoded and scaled aside, the picture is almost 5000 pixels wide.
 */
export const FOG_TEXTURE_SCALE = 2;

let texture: Promise<HTMLCanvasElement | null> | null = null;

export function fog_texture() {
    texture ??= make();
    return texture;
}

async function make() {
    try {
        const image = new Image();
        image.src = "fog.jpg";
        await image.decode();
        const width = Math.round(image.naturalWidth / FOG_TEXTURE_SCALE);
        const height = Math.round(image.naturalHeight / FOG_TEXTURE_SCALE);
        const small = await createImageBitmap(image, {
            resizeWidth: width,
            resizeHeight: height,
            resizeQuality: "medium",
        });
        const pad = 8;
        const tiled = document.createElement("canvas");
        tiled.width = width + 2 * pad;
        tiled.height = height + 2 * pad;
        const tiled_ctx = tiled.getContext("2d")!;
        for (const dx of [-width, 0, width]) {
            for (const dy of [-height, 0, height]) {
                tiled_ctx.drawImage(small, pad + dx, pad + dy);
            }
        }
        small.close();
        const result = document.createElement("canvas");
        result.width = width;
        result.height = height;
        const ctx = result.getContext("2d")!;
        ctx.filter = `blur(${5 / FOG_TEXTURE_SCALE}px)`;
        ctx.drawImage(tiled, -pad, -pad);
        return result;
    } catch (e) {
        console.error("The fog's texture could not be made", e);
        texture = null;
        return null;
    }
}
