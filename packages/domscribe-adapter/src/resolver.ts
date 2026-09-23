/**
 * SourceResolver: data-ds + page context → SourceContext or degraded (C-017).
 * Location: packages/domscribe-adapter/src/resolver.ts
 */

import type { SourceContext } from "@agent-visual-editor/core";
import { createPageStatusStore } from "./page-status.js";
import type {
  DomscribeLookup,
  DomscribeUiStatus,
  ResolveRequest,
  SourceResolver,
  SourceResolverOptions,
} from "./types.js";

function degradedUnavailable(dataDs?: string): SourceContext {
  const source: SourceContext = {
    resolver: "none",
    freshness: "unavailable",
  };
  if (dataDs !== undefined) {
    source.dataDs = dataDs;
  }
  return source;
}

function degradedUnmapped(dataDs: string): SourceContext {
  return {
    resolver: "domscribe",
    dataDs,
    freshness: "unmapped",
  };
}

export function createSourceResolver(options: SourceResolverOptions = {}): SourceResolver {
  const enabled = options.enabled !== false;
  const lookup: DomscribeLookup | undefined = options.lookup;
  const pages = createPageStatusStore("unavailable");

  const setStatus = (
    status: DomscribeUiStatus,
    pageUrl?: string,
    projectKey?: string,
  ): void => {
    pages.set(status, pageUrl, projectKey);
  };

  return {
    async resolve(request: ResolveRequest): Promise<SourceContext | undefined> {
      const { dataDs, pageUrl, projectKey, previousFileHash } = request;

      if (!enabled) {
        setStatus("unavailable", pageUrl, projectKey);
        return dataDs !== undefined ? degradedUnavailable(dataDs) : undefined;
      }

      if (dataDs === undefined || dataDs.trim().length === 0) {
        // No mapping id on this page/element — page-local unavailable (FR-029).
        setStatus("unavailable", pageUrl, projectKey);
        return undefined;
      }

      if (!lookup) {
        setStatus("unavailable", pageUrl, projectKey);
        return degradedUnavailable(dataDs);
      }

      let result: Awaited<ReturnType<DomscribeLookup["resolveById"]>>;
      try {
        result = await lookup.resolveById(dataDs);
      } catch {
        setStatus("error", pageUrl, projectKey);
        return degradedUnavailable(dataDs);
      }

      if (result === "unavailable") {
        setStatus("unavailable", pageUrl, projectKey);
        return degradedUnavailable(dataDs);
      }
      if (result === "error") {
        setStatus("error", pageUrl, projectKey);
        return degradedUnavailable(dataDs);
      }
      if (result === null) {
        setStatus("unavailable", pageUrl, projectKey);
        return degradedUnmapped(dataDs);
      }

      const hashMismatch =
        previousFileHash !== undefined &&
        result.fileHash !== undefined &&
        previousFileHash !== result.fileHash;
      const stale = result.stale === true || hashMismatch;
      const freshness = stale ? "stale" : "fresh";

      setStatus(stale ? "stale" : "available", pageUrl, projectKey);

      const source: SourceContext = {
        resolver: "domscribe",
        dataDs,
        file: result.file,
        line: result.line,
        freshness,
      };
      if (result.column !== undefined) {
        source.column = result.column;
      }
      if (result.component !== undefined) {
        source.component = result.component;
      }
      if (result.runtimeSummary !== undefined) {
        source.runtimeSummary = result.runtimeSummary;
      }
      return source;
    },

    statusFor(pageUrl, projectKey) {
      return pages.get(pageUrl, projectKey);
    },

    lastStatus() {
      return pages.last();
    },
  };
}
