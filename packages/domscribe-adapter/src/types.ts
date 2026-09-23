/**
 * Adapter types for SourceResolver / Domscribe lookup (C-017).
 * Location: packages/domscribe-adapter/src/types.ts
 */

import type { SourceContext } from "@agent-visual-editor/core";

/** Per-page / per-project UI status (FR-029) — never conflated with bridge connection. */
export type DomscribeUiStatus = "unavailable" | "available" | "stale" | "error";

export type DomscribeManifestEntry = {
  id: string;
  file: string;
  line: number;
  column?: number;
  component?: string;
  fileHash?: string;
  /** Manifest/runtime reports stale (HMR / EDGE-006). */
  stale?: boolean;
  runtimeSummary?: unknown;
};

/**
 * Injectable lookup behind the adapter boundary.
 * Implementations must not throw — return sentinel strings instead.
 */
export type DomscribeLookup = {
  probe(): Promise<"available" | "unavailable" | "error">;
  resolveById(
    id: string,
  ): Promise<DomscribeManifestEntry | null | "unavailable" | "error">;
};

export type ResolveRequest = {
  dataDs?: string;
  pageUrl?: string;
  projectKey?: string;
  /** Prior fileHash for HMR stale detection (BR-007). */
  previousFileHash?: string;
};

export type SourceResolver = {
  resolve(request: ResolveRequest): Promise<SourceContext | undefined>;
  statusFor(pageUrl?: string, projectKey?: string): DomscribeUiStatus;
  lastStatus(): DomscribeUiStatus;
};

export type SourceResolverOptions = {
  lookup?: DomscribeLookup;
  /** When false, always return degraded unavailable (feature flag). */
  enabled?: boolean;
};
