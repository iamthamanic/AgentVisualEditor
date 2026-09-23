/**
 * C-015 apply_preview orchestration: flag, allowlist, browser apply, store record.
 * Location: packages/openclaw-plugin/src/preview-apply.ts
 *
 * INV-1: never send. BR-009: allowlist enforced before browser. INV-3: caller binds session.
 */

import { validatePreviewStyles } from "@agent-visual-editor/core";
import { PROTOCOL_VERSION, type PreviewApplyCommand } from "@agent-visual-editor/protocol";
import type { VisualBatchStore } from "./store.js";

export type AppliedPreviewStyle = {
  property: string;
  value: string;
  oldValue?: string;
};

export type BrowserPreviewApplier = {
  apply(command: PreviewApplyCommand): Promise<
    | { ok: true; applied: AppliedPreviewStyle[] }
    | {
        ok: false;
        code: "stale" | "browser_unavailable" | "forbidden_property";
        message: string;
      }
  >;
  hasBrowser(): boolean;
};

export type ApplyPreviewInput = {
  selectionId: string;
  styles: Array<{ property: string; value: string }>;
  requestId?: string;
};

export type ApplyPreviewResult =
  | {
      ok: true;
      selectionId: string;
      requestId: string;
      revision: number;
      applied: AppliedPreviewStyle[];
      uncommittedPreview: true;
    }
  | {
      ok: false;
      code:
        | "forbidden"
        | "not_found"
        | "forbidden_property"
        | "stale"
        | "browser_unavailable";
      message: string;
    };

/** Session-scoped requestId dedupe: `${agentId}::${sessionKey}::${requestId}`. */
const recentResults = new Map<string, ApplyPreviewResult>();
const REQUEST_DEDUP_MAX = 128;

function dedupeKey(agentId: string, sessionKey: string, requestId: string): string {
  return `${agentId}::${sessionKey}::${requestId}`;
}

function remember(
  agentId: string,
  sessionKey: string,
  requestId: string,
  result: ApplyPreviewResult,
): void {
  recentResults.set(dedupeKey(agentId, sessionKey, requestId), result);
  if (recentResults.size > REQUEST_DEDUP_MAX) {
    const first = recentResults.keys().next().value;
    if (typeof first === "string") {
      recentResults.delete(first);
    }
  }
}

export async function runApplyPreview(deps: {
  enabled: boolean;
  store: VisualBatchStore;
  agentId: string;
  sessionKey: string;
  browser: BrowserPreviewApplier;
  input: ApplyPreviewInput;
}): Promise<ApplyPreviewResult> {
  if (!deps.enabled) {
    return {
      ok: false,
      code: "forbidden",
      message: "Agent-Preview-Apply ist deaktiviert (agentPreviewApplyEnabled=false)",
    };
  }

  const requestId = deps.input.requestId?.trim() || `apply_${crypto.randomUUID().replace(/-/g, "")}`;
  const cached = recentResults.get(dedupeKey(deps.agentId, deps.sessionKey, requestId));
  if (cached !== undefined) {
    return cached;
  }

  const validated = validatePreviewStyles(deps.input.styles);
  if (!validated.ok) {
    const result: ApplyPreviewResult = {
      ok: false,
      code: "forbidden_property",
      message: validated.message,
    };
    remember(deps.agentId, deps.sessionKey, requestId, result);
    return result;
  }

  const batch = deps.store.getActiveContextBatch(deps.agentId, deps.sessionKey);
  const selection = batch?.selections.find((s) => s.id === deps.input.selectionId);
  if (!batch || !selection) {
    const result: ApplyPreviewResult = {
      ok: false,
      code: "not_found",
      message: "Selektion nicht gefunden",
    };
    remember(deps.agentId, deps.sessionKey, requestId, result);
    return result;
  }

  if (!deps.browser.hasBrowser()) {
    const result: ApplyPreviewResult = {
      ok: false,
      code: "browser_unavailable",
      message: "Kein gekoppelter Browser verfügbar",
    };
    remember(deps.agentId, deps.sessionKey, requestId, result);
    return result;
  }

  const command: PreviewApplyCommand = {
    type: "preview.apply",
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    selectionId: selection.id,
    selector: selection.selector,
    styles: validated.styles.map((s) => ({ property: s.property, value: s.value })),
    pageUrl: selection.pageUrl,
  };

  const browserResult = await deps.browser.apply(command);
  if (!browserResult.ok) {
    const result: ApplyPreviewResult = {
      ok: false,
      code: browserResult.code,
      message: browserResult.message,
    };
    remember(deps.agentId, deps.sessionKey, requestId, result);
    return result;
  }

  const recorded = deps.store.recordPreviewApply(
    deps.agentId,
    deps.sessionKey,
    selection.id,
    browserResult.applied,
  );
  if (!recorded.ok) {
    const result: ApplyPreviewResult = {
      ok: false,
      code: "not_found",
      message: recorded.message,
    };
    remember(deps.agentId, deps.sessionKey, requestId, result);
    return result;
  }

  const result: ApplyPreviewResult = {
    ok: true,
    selectionId: selection.id,
    requestId,
    revision: recorded.revision,
    applied: browserResult.applied,
    uncommittedPreview: true,
  };
  remember(deps.agentId, deps.sessionKey, requestId, result);
  return result;
}

/** Test helper: clear requestId dedupe cache. */
export function clearApplyPreviewDedupeForTests(): void {
  recentResults.clear();
}
