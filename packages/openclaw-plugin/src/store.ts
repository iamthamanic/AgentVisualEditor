/**
 * VisualBatchStore keyed by `${agentId}::${sessionKey}`.
 * Location: packages/openclaw-plugin/src/store.ts
 *
 * Selection/chip mutations never send (INV-1). Multi-session isolation (FR-010).
 */

import {
  admitSend,
  attachSelection,
  clearVisualBatch,
  createVisualBatch,
  prepareSend,
  rejectSend,
  removeSelection,
  sessionStoreKey,
  type SelectionDraftInput,
  type VisualBatch,
  type VisualSelection,
} from "@agent-visual-editor/core";

export type StoreAttachResult = {
  batch: VisualBatch;
  selection: VisualSelection;
  deduped: boolean;
};

export class VisualBatchStore {
  private readonly batches = new Map<string, VisualBatch>();

  key(agentId: string, sessionKey: string): string {
    return sessionStoreKey(agentId, sessionKey);
  }

  getOrCreate(agentId: string, sessionKey: string): VisualBatch {
    const key = this.key(agentId, sessionKey);
    const existing = this.batches.get(key);
    if (existing) {
      return existing;
    }
    const batch = createVisualBatch(sessionKey, agentId);
    this.batches.set(key, batch);
    return batch;
  }

  /** Replace a terminal batch with a fresh draft for new chip attachments. */
  ensureDraft(agentId: string, sessionKey: string): VisualBatch {
    const existing = this.get(agentId, sessionKey);
    if (existing && (existing.state === "draft" || existing.state === "preparing")) {
      return existing;
    }
    const batch = createVisualBatch(sessionKey, agentId);
    this.batches.set(this.key(agentId, sessionKey), batch);
    return batch;
  }

  get(agentId: string, sessionKey: string): VisualBatch | undefined {
    return this.batches.get(this.key(agentId, sessionKey));
  }

  snapshot(agentId: string, sessionKey: string): VisualBatch {
    return this.getOrCreate(agentId, sessionKey);
  }

  attach(agentId: string, sessionKey: string, input: SelectionDraftInput): StoreAttachResult {
    const current = this.ensureDraft(agentId, sessionKey);
    const result = attachSelection(current, input);
    this.batches.set(this.key(agentId, sessionKey), result.batch);
    return result;
  }

  remove(agentId: string, sessionKey: string, selectionId: string): VisualBatch {
    const current = this.getOrCreate(agentId, sessionKey);
    const next = removeSelection(current, selectionId);
    this.batches.set(this.key(agentId, sessionKey), next);
    return next;
  }

  clear(agentId: string, sessionKey: string): VisualBatch {
    const current = this.getOrCreate(agentId, sessionKey);
    const next = clearVisualBatch(current);
    this.batches.set(this.key(agentId, sessionKey), next);
    return next;
  }

  /** Explicit Send path only — prepare then admit or reject. */
  beginPrepare(agentId: string, sessionKey: string): VisualBatch {
    const current = this.getOrCreate(agentId, sessionKey);
    const next = prepareSend(current);
    this.batches.set(this.key(agentId, sessionKey), next);
    return next;
  }

  completeSend(agentId: string, sessionKey: string, admitted: boolean): VisualBatch {
    const current = this.getOrCreate(agentId, sessionKey);
    const next = admitted ? admitSend(current) : rejectSend(current);
    this.batches.set(this.key(agentId, sessionKey), next);
    return next;
  }

  /** Project compact JSON for session extension (no large DOM). */
  project(agentId: string, sessionKey: string): {
    batchId: string;
    state: string;
    selectionCount: number;
    selections: Array<{
      id: string;
      tag: string;
      selector: string;
      textSummary: string | null;
      component: string | null;
      file: string | null;
      line: number | null;
    }>;
  } | {
    state: string;
    selectionCount: number;
    selections: [];
  } {
    const batch = this.get(agentId, sessionKey);
    if (!batch) {
      return { state: "empty", selectionCount: 0, selections: [] };
    }
    return {
      batchId: batch.id,
      state: batch.state,
      selectionCount: batch.selections.length,
      selections: batch.selections.map((sel) => ({
        id: sel.id,
        tag: sel.tag,
        selector: sel.selector,
        textSummary: sel.textSummary ?? null,
        component: sel.source?.component ?? null,
        file: sel.source?.file ?? null,
        line: sel.source?.line ?? null,
      })),
    };
  }

  deleteSession(agentId: string, sessionKey: string): void {
    this.batches.delete(this.key(agentId, sessionKey));
  }

  /** Test helper: count stored session keys. */
  size(): number {
    return this.batches.size;
  }

  findBySessionKey(sessionKey: string): VisualBatch | undefined {
    for (const batch of this.batches.values()) {
      if (batch.sessionKey === sessionKey) {
        return batch;
      }
    }
    return undefined;
  }
}
