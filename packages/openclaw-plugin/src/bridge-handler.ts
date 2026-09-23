/**
 * Bridge message dispatcher → VisualBatchStore + ArtifactStore (C-004..C-009). INV-1: never send.
 * Location: packages/openclaw-plugin/src/bridge-handler.ts
 *
 * SLC-4: resolves data-ds via SourceResolver before admit (FR-011/FR-012).
 * SLC-5: VisualChange updates + artifact.upload when previewEditingEnabled.
 */

import {
  InvalidBatchStateError,
  LimitReachedError,
  PayloadTooLargeError,
  SCREENSHOT_MAX_BYTES,
  type SelectionDraftInput,
  type SourceContext,
  type VisualChange,
} from "@agent-visual-editor/core";
import type { SourceResolver } from "@agent-visual-editor/domscribe-adapter";
import {
  PROTOCOL_VERSION,
  parseInbound,
  type BridgeOkResponse,
  type ErrorEnvelope,
  type InboundBridgeMessage,
} from "@agent-visual-editor/protocol";
import type { ActiveSessionTracker } from "./active-session.js";
import {
  decodePngBase64,
  type ArtifactStore,
} from "./artifact-store.js";
import type { PairedConnection } from "./pairing.js";
import { toBatchDto } from "./project-batch.js";
import type { VisualBatchStore } from "./store.js";

const REQUEST_DEDUP_MAX = 256;

export type BridgeHandlerDeps = {
  store: VisualBatchStore;
  sessions: ActiveSessionTracker;
  connection: PairedConnection;
  onBatchChanged?: (agentId: string, sessionKey: string) => void;
  sourceResolver?: SourceResolver;
  artifacts?: ArtifactStore;
  previewEditingEnabled?: boolean;
};

export type BridgeHandleResult = BridgeOkResponse | ErrorEnvelope;

function errorEnvelope(
  code: ErrorEnvelope["code"],
  message: string,
  requestId?: string,
): ErrorEnvelope {
  const err: ErrorEnvelope = { ok: false, code, message };
  if (requestId !== undefined) {
    err.requestId = requestId;
  }
  return err;
}

function withSourceFreshness(
  result: BridgeHandleResult,
  source: SourceContext | undefined,
): BridgeHandleResult {
  if (!result.ok || source === undefined) {
    return result;
  }
  if (!("selectionId" in result) || !("requestId" in result)) {
    return result;
  }
  if ("artifactId" in result) {
    return result;
  }
  return {
    ...result,
    sourceFreshness: source.freshness,
  };
}

export class BridgeMessageHandler {
  private readonly recent = new Map<string, BridgeHandleResult>();

  constructor(private readonly deps: BridgeHandlerDeps) {}

  async handleRaw(raw: unknown): Promise<BridgeHandleResult> {
    const parsed = parseInbound(raw);
    if (!parsed.ok) {
      return parsed.error;
    }
    return this.handle(parsed.message);
  }

  async handle(message: InboundBridgeMessage): Promise<BridgeHandleResult> {
    const requestId = "requestId" in message ? message.requestId : undefined;
    if (requestId !== undefined) {
      const cached = this.recent.get(requestId);
      if (cached !== undefined) {
        return cached;
      }
    }

    let result: BridgeHandleResult;
    switch (message.type) {
      case "bridge.hello":
        result = this.hello(message.requestId);
        break;
      case "selection.create":
        result = await this.create(message);
        break;
      case "selection.remove":
        result = this.remove(message);
        break;
      case "selection.update":
        result = await this.update(message);
        break;
      case "artifact.upload":
        result = this.uploadArtifact(message);
        break;
      case "preview.apply.result":
        // Normally intercepted by BridgeHub; acknowledge if reached.
        result = {
          ok: true,
          type: "preview.apply.result",
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          selectionId: message.selectionId,
          applied: message.applied,
        };
        break;
      default: {
        const _exhaustive: never = message;
        void _exhaustive;
        result = errorEnvelope("invalid_message", "Unbekannter Nachrichtentyp");
      }
    }

    if (requestId !== undefined) {
      this.remember(requestId, result);
    }
    return result;
  }

  private hello(requestId: string): BridgeHandleResult {
    return {
      ok: true,
      type: "bridge.hello.ack",
      requestId,
      connectionId: this.deps.connection.connectionId,
      protocolVersion: PROTOCOL_VERSION,
    };
  }

  private async resolveSource(input: {
    dataDs?: string;
    pageUrl: string;
    previousFileHash?: string;
  }): Promise<SourceContext | undefined> {
    const resolver = this.deps.sourceResolver;
    if (!resolver) {
      if (input.dataDs === undefined) {
        return undefined;
      }
      return {
        resolver: "none",
        freshness: "unavailable",
        dataDs: input.dataDs,
      };
    }
    return resolver.resolve({
      pageUrl: input.pageUrl,
      ...(input.dataDs !== undefined ? { dataDs: input.dataDs } : {}),
      ...(input.previousFileHash !== undefined
        ? { previousFileHash: input.previousFileHash }
        : {}),
    });
  }

  private async create(
    message: Extract<InboundBridgeMessage, { type: "selection.create" }>,
  ): Promise<BridgeHandleResult> {
    const target = this.deps.sessions.requireExact();
    if (!target.ok) {
      return errorEnvelope(target.code, target.message, message.requestId);
    }

    const draft: SelectionDraftInput = {
      pageUrl: message.page.url,
      tag: message.element.tag,
      selector: message.element.selector,
    };
    if (message.page.title !== undefined) {
      draft.pageTitle = message.page.title;
    }
    if (message.element.textSummary !== undefined) {
      draft.textSummary = message.element.textSummary;
    }
    if (message.element.box !== undefined) {
      draft.box = message.element.box;
    }
    if (message.tabId !== undefined) {
      draft.tabId = message.tabId;
    }
    if (message.domSnapshot !== undefined) {
      draft.domSnapshot = message.domSnapshot;
    }

    const source = await this.resolveSource({
      pageUrl: message.page.url,
      ...(message.element.dataDs !== undefined ? { dataDs: message.element.dataDs } : {}),
    });
    if (source !== undefined) {
      draft.source = source;
    }

    try {
      const attached = this.deps.store.attach(target.agentId, target.sessionKey, draft);
      this.deps.onBatchChanged?.(target.agentId, target.sessionKey);
      return withSourceFreshness(
        {
          ok: true,
          requestId: message.requestId,
          selectionId: attached.selection.id,
          deduped: attached.deduped,
        },
        attached.selection.source,
      );
    } catch (error) {
      return this.mapStoreError(error, message.requestId);
    }
  }

  private remove(message: Extract<InboundBridgeMessage, { type: "selection.remove" }>): BridgeHandleResult {
    const target = this.deps.sessions.requireExact();
    if (!target.ok) {
      return errorEnvelope(target.code, target.message, message.requestId);
    }
    const before = this.deps.store.get(target.agentId, target.sessionKey);
    const existed = before?.selections.some((s) => s.id === message.selectionId) ?? false;
    if (!existed) {
      return {
        ok: true,
        requestId: message.requestId,
        selectionId: message.selectionId,
        removed: true,
      };
    }
    try {
      this.deps.store.remove(target.agentId, target.sessionKey, message.selectionId);
      this.deps.onBatchChanged?.(target.agentId, target.sessionKey);
      return {
        ok: true,
        requestId: message.requestId,
        selectionId: message.selectionId,
        removed: true,
      };
    } catch (error) {
      return this.mapStoreError(error, message.requestId);
    }
  }

  private async update(
    message: Extract<InboundBridgeMessage, { type: "selection.update" }>,
  ): Promise<BridgeHandleResult> {
    const target = this.deps.sessions.requireExact();
    if (!target.ok) {
      return errorEnvelope(target.code, target.message, message.requestId);
    }

    if (message.change !== undefined && this.deps.previewEditingEnabled === false) {
      return errorEnvelope(
        "forbidden",
        "Preview-Editing ist deaktiviert (previewEditingEnabled=false)",
        message.requestId,
      );
    }

    const batch = this.deps.store.get(target.agentId, target.sessionKey);
    const existing = batch?.selections.find((s) => s.id === message.selectionId);
    if (!existing || !batch) {
      return errorEnvelope("not_found", "Selektion nicht gefunden", message.requestId);
    }

    const draft: SelectionDraftInput = {
      pageUrl: existing.pageUrl,
      tag: message.element?.tag ?? existing.tag,
      selector: message.element?.selector ?? existing.selector,
    };
    if (existing.pageTitle !== undefined) {
      draft.pageTitle = existing.pageTitle;
    }
    if (message.element?.textSummary !== undefined) {
      draft.textSummary = message.element.textSummary;
    } else if (existing.textSummary !== undefined) {
      draft.textSummary = existing.textSummary;
    }
    if (message.element?.box !== undefined) {
      draft.box = message.element.box;
    } else if (existing.box !== undefined) {
      draft.box = existing.box;
    }
    if (existing.tabId !== undefined) {
      draft.tabId = existing.tabId;
    }
    if (existing.domSnapshot !== undefined) {
      draft.domSnapshot = existing.domSnapshot;
    }

    const dataDs = message.element?.dataDs ?? existing.source?.dataDs;
    const shouldRefresh =
      message.element?.dataDs !== undefined || existing.source?.dataDs !== undefined;
    if (shouldRefresh) {
      const source = await this.resolveSource({
        pageUrl: existing.pageUrl,
        ...(dataDs !== undefined ? { dataDs } : {}),
      });
      if (source !== undefined) {
        draft.source = source;
      }
    } else if (existing.source !== undefined) {
      draft.source = existing.source;
    }

    const changes: VisualChange[] = [...existing.changes];
    if (message.change !== undefined) {
      const idx = changes.findIndex((c) => c.id === message.change?.id);
      if (idx >= 0) {
        changes[idx] = message.change;
      } else {
        changes.push(message.change);
      }
    }
    draft.changes = changes;

    try {
      const updated = this.deps.store.replaceSelection(
        target.agentId,
        target.sessionKey,
        message.selectionId,
        draft,
      );
      if (!updated) {
        return errorEnvelope("not_found", "Selektion nicht gefunden", message.requestId);
      }
      this.deps.onBatchChanged?.(target.agentId, target.sessionKey);
      void toBatchDto(updated.batch);
      return withSourceFreshness(
        {
          ok: true,
          requestId: message.requestId,
          selectionId: updated.selection.id,
          revision: message.revision ?? 0,
        },
        updated.selection.source,
      );
    } catch (error) {
      return this.mapStoreError(error, message.requestId);
    }
  }

  private uploadArtifact(
    message: Extract<InboundBridgeMessage, { type: "artifact.upload" }>,
  ): BridgeHandleResult {
    if (this.deps.previewEditingEnabled === false) {
      return errorEnvelope(
        "forbidden",
        "Screenshot-Upload ist deaktiviert (previewEditingEnabled=false)",
        message.requestId,
      );
    }
    const artifacts = this.deps.artifacts;
    if (!artifacts) {
      return errorEnvelope(
        "forbidden",
        "artifact.upload ist nicht verfügbar",
        message.requestId,
      );
    }

    const target = this.deps.sessions.requireExact();
    if (!target.ok) {
      return errorEnvelope(target.code, target.message, message.requestId);
    }

    const batch = this.deps.store.get(target.agentId, target.sessionKey);
    const selection = batch?.selections.find((s) => s.id === message.selectionId);
    if (!selection) {
      return errorEnvelope("not_found", "Selektion nicht gefunden", message.requestId);
    }

    if (message.mime !== "image/png") {
      return errorEnvelope("invalid_type", "Nur image/png erlaubt", message.requestId);
    }
    if (message.byteSize > SCREENSHOT_MAX_BYTES) {
      return errorEnvelope(
        "too_large",
        `Screenshot überschreitet ${SCREENSHOT_MAX_BYTES} Bytes`,
        message.requestId,
      );
    }

    const png = decodePngBase64(message.pngBase64);
    if (!png) {
      return errorEnvelope("invalid_type", "PNG-Body ungültig", message.requestId);
    }
    if (png.byteLength !== message.byteSize) {
      return errorEnvelope(
        "invalid_message",
        "byteSize stimmt nicht mit PNG-Body überein",
        message.requestId,
      );
    }

    const put = artifacts.put({
      selectionId: message.selectionId,
      agentId: target.agentId,
      sessionKey: target.sessionKey,
      width: message.width,
      height: message.height,
      png,
      kind: message.kind ?? "viewport",
      pageUrl: message.pageUrl ?? selection.pageUrl,
      ...(message.capturedAt !== undefined ? { capturedAt: message.capturedAt } : {}),
      ...(message.contentHash !== undefined ? { contentHash: message.contentHash } : {}),
    });

    if (!put.ok) {
      return errorEnvelope(put.code, put.message, message.requestId);
    }

    return {
      ok: true,
      requestId: message.requestId,
      selectionId: message.selectionId,
      artifactId: put.artifact.id,
      deduped: put.deduped,
      capturedAt: put.artifact.capturedAt,
      expiresAt: put.artifact.expiresAt,
      byteSize: put.artifact.byteSize,
      width: put.artifact.width,
      height: put.artifact.height,
      kind: put.artifact.kind,
    };
  }

  private mapStoreError(error: unknown, requestId: string): ErrorEnvelope {
    if (error instanceof LimitReachedError) {
      return errorEnvelope("limit_reached", error.message, requestId);
    }
    if (error instanceof PayloadTooLargeError) {
      return errorEnvelope("payload_too_large", error.message, requestId);
    }
    if (error instanceof InvalidBatchStateError) {
      return errorEnvelope("stale", error.message, requestId);
    }
    return errorEnvelope("invalid_message", "Selektion konnte nicht verarbeitet werden", requestId);
  }

  private remember(requestId: string, result: BridgeHandleResult): void {
    this.recent.set(requestId, result);
    if (this.recent.size > REQUEST_DEDUP_MAX) {
      const first = this.recent.keys().next().value;
      if (typeof first === "string") {
        this.recent.delete(first);
      }
    }
  }
}
