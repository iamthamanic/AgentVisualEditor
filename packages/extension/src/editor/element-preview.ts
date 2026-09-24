/**
 * Crop a viewport PNG to an element box (DOM canvas — side panel / pages).
 * Location: packages/extension/src/editor/element-preview.ts
 */

export type ElementBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const PREVIEW_MAX_EDGE = 360;
const PAD_CSS = 6;

/**
 * Reliable crop using HTML Image + Canvas (side panel). Prefer this over SW OffscreenCanvas.
 */
export async function cropElementPreviewInDom(
  viewportDataUrl: string,
  box: ElementBox,
  devicePixelRatio: number,
): Promise<string | null> {
  if (box.width < 1 || box.height < 1) {
    return null;
  }
  if (typeof document === "undefined") {
    return null;
  }

  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const pad = Math.round(PAD_CSS * dpr);

  const img = await loadImage(viewportDataUrl);
  const sx = Math.max(0, Math.floor(box.x * dpr) - pad);
  const sy = Math.max(0, Math.floor(box.y * dpr) - pad);
  const sw = Math.min(img.naturalWidth - sx, Math.ceil(box.width * dpr) + pad * 2);
  const sh = Math.min(img.naturalHeight - sy, Math.ceil(box.height * dpr) + pad * 2);
  if (sw < 1 || sh < 1) {
    return null;
  }

  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
