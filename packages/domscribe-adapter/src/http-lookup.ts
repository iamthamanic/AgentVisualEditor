/**
 * HTTP relay lookup against public Domscribe REST (Q-002 least moving parts).
 * Location: packages/domscribe-adapter/src/http-lookup.ts
 *
 * GET /api/health — probe
 * GET /api/manifest/:id — resolve data-ds
 */

import type { DomscribeLookup, DomscribeManifestEntry } from "./types.js";

export const DEFAULT_RELAY_HEALTH_TIMEOUT_MS = 500;

export type HttpRelayLookupOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function parseManifestEntry(id: string, body: unknown): DomscribeManifestEntry | null {
  if (!isRecord(body)) {
    return null;
  }
  // Accept either bare ManifestEntry or { entry: ManifestEntry } / { found, ... }.
  const raw = isRecord(body.entry) ? body.entry : body;
  if (body.found === false) {
    return null;
  }
  const file = typeof raw.file === "string" ? raw.file : undefined;
  if (!file) {
    return null;
  }

  let line: number | undefined;
  let column: number | undefined;
  if (isRecord(raw.start)) {
    line = readPositiveInt(raw.start.line);
    column = readPositiveInt(raw.start.column);
  }
  if (line === undefined) {
    line = readPositiveInt(raw.line);
  }
  if (column === undefined) {
    column = readPositiveInt(raw.column);
  }
  if (line === undefined || line < 1) {
    return null;
  }

  const entry: DomscribeManifestEntry = {
    id: typeof raw.id === "string" ? raw.id : id,
    file,
    line,
  };
  if (column !== undefined) {
    entry.column = column;
  }
  const component =
    typeof raw.componentName === "string"
      ? raw.componentName
      : typeof raw.component === "string"
        ? raw.component
        : undefined;
  if (component !== undefined) {
    entry.component = component;
  }
  if (typeof raw.fileHash === "string") {
    entry.fileHash = raw.fileHash;
  }
  if (raw.stale === true) {
    entry.stale = true;
  }
  if (raw.runtimeSummary !== undefined) {
    entry.runtimeSummary = raw.runtimeSummary;
  } else if (raw.runtimeContext !== undefined) {
    entry.runtimeSummary = raw.runtimeContext;
  }
  return entry;
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: true; status: number; body: unknown } | { ok: false; reason: "unavailable" | "error" }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 404) {
      return { ok: true, status: 404, body: null };
    }
    if (!response.ok) {
      return { ok: false, reason: response.status >= 500 ? "unavailable" : "error" };
    }
    const body: unknown = await response.json();
    return { ok: true, status: response.status, body };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export function createHttpRelayLookup(options: HttpRelayLookupOptions): DomscribeLookup {
  const base = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RELAY_HEALTH_TIMEOUT_MS;

  return {
    async probe() {
      const result = await fetchJson(`${base}/api/health`, fetchImpl, timeoutMs);
      if (!result.ok) {
        return result.reason;
      }
      return "available";
    },
    async resolveById(id) {
      const encoded = encodeURIComponent(id);
      const result = await fetchJson(`${base}/api/manifest/${encoded}`, fetchImpl, timeoutMs);
      if (!result.ok) {
        return result.reason;
      }
      if (result.status === 404 || result.body === null) {
        return null;
      }
      return parseManifestEntry(id, result.body);
    },
  };
}
