/**
 * Screenshot byte-cap helpers (FR-018 / NFR-006 / EDGE-011).
 * Location: packages/extension/src/editor/screenshot-bounds.ts
 */

export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;

export type ScreenshotBoundResult =
  | { ok: true; byteSize: number; pngBase64: string }
  | { ok: false; code: "too_large" | "invalid_type"; message: string };

/**
 * Strip data-URL prefix and validate PNG size ≤ 2 MiB.
 */
export function boundPngDataUrl(dataUrlOrBase64: string): ScreenshotBoundResult {
  const raw = dataUrlOrBase64.includes(",")
    ? dataUrlOrBase64.slice(dataUrlOrBase64.indexOf(",") + 1)
    : dataUrlOrBase64;
  if (raw.length === 0) {
    return { ok: false, code: "invalid_type", message: "PNG-Body fehlt" };
  }
  let byteSize: number;
  try {
    // atob available in extension SW / browser; Node tests use Buffer path below.
    if (typeof atob === "function") {
      const binary = atob(raw);
      byteSize = binary.length;
      if (byteSize > SCREENSHOT_MAX_BYTES) {
        return {
          ok: false,
          code: "too_large",
          message: `Screenshot überschreitet ${SCREENSHOT_MAX_BYTES} Bytes`,
        };
      }
      if (
        binary.length < 8 ||
        binary.charCodeAt(0) !== 0x89 ||
        binary.charCodeAt(1) !== 0x50
      ) {
        return { ok: false, code: "invalid_type", message: "Nur image/png erlaubt" };
      }
      return { ok: true, byteSize, pngBase64: raw };
    }
  } catch {
    return { ok: false, code: "invalid_type", message: "PNG-Body ungültig" };
  }

  // Node/test fallback via approximate base64 length
  byteSize = Math.floor((raw.length * 3) / 4);
  if (byteSize > SCREENSHOT_MAX_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message: `Screenshot überschreitet ${SCREENSHOT_MAX_BYTES} Bytes`,
    };
  }
  return { ok: true, byteSize, pngBase64: raw };
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
