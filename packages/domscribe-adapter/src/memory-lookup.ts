/**
 * In-memory Domscribe lookup for fixtures and unit tests (T-024).
 * Location: packages/domscribe-adapter/src/memory-lookup.ts
 */

import type { DomscribeLookup, DomscribeManifestEntry } from "./types.js";

export function createMemoryLookup(
  entries: ReadonlyMap<string, DomscribeManifestEntry> | Record<string, DomscribeManifestEntry>,
  options?: { probe?: "available" | "unavailable" | "error" },
): DomscribeLookup {
  const map =
    entries instanceof Map
      ? entries
      : new Map(Object.entries(entries));
  const probeResult = options?.probe ?? "available";

  return {
    async probe() {
      return probeResult;
    },
    async resolveById(id) {
      if (probeResult === "unavailable" || probeResult === "error") {
        return probeResult;
      }
      return map.get(id) ?? null;
    },
  };
}
