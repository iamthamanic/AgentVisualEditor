/**
 * Shared size and count limits for VisualSelection / VisualBatch (NFR-006).
 * Location: packages/core/src/limits.ts
 */

export const SELECTION_JSON_MAX_BYTES = 256 * 1024;
export const DOM_SNAPSHOT_MAX_BYTES = 100 * 1024;
export const RUNTIME_SUMMARY_MAX_BYTES = 64 * 1024;
export const TEXT_SUMMARY_MAX_BYTES = 2 * 1024;
export const SELECTOR_MAX_BYTES = 8 * 1024;
export const MAX_CHIPS_PER_DRAFT = 10;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function measureJsonBytes(value: unknown): number {
  return utf8ByteLength(JSON.stringify(value));
}
