/**
 * Per-page / per-project Domscribe status store (FR-029).
 * Location: packages/domscribe-adapter/src/page-status.ts
 */

import type { DomscribeUiStatus } from "./types.js";

function statusKey(pageUrl?: string, projectKey?: string): string {
  if (projectKey && projectKey.trim().length > 0) {
    return `project:${projectKey.trim()}`;
  }
  if (pageUrl && pageUrl.trim().length > 0) {
    try {
      const url = new URL(pageUrl);
      return `page:${url.origin}${url.pathname}`;
    } catch {
      return `page:${pageUrl.trim()}`;
    }
  }
  return "global";
}

export type PageStatusStore = {
  set(status: DomscribeUiStatus, pageUrl?: string, projectKey?: string): void;
  get(pageUrl?: string, projectKey?: string): DomscribeUiStatus;
  last(): DomscribeUiStatus;
};

export function createPageStatusStore(
  initial: DomscribeUiStatus = "unavailable",
): PageStatusStore {
  const byKey = new Map<string, DomscribeUiStatus>();
  let lastStatus: DomscribeUiStatus = initial;

  return {
    set(status, pageUrl, projectKey) {
      const key = statusKey(pageUrl, projectKey);
      byKey.set(key, status);
      lastStatus = status;
    },
    get(pageUrl, projectKey) {
      return byKey.get(statusKey(pageUrl, projectKey)) ?? "unavailable";
    },
    last() {
      return lastStatus;
    },
  };
}
