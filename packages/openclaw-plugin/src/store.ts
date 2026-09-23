/**
 * VisualBatchStore keyed by `${agentId}::${sessionKey}`.
 * Location: packages/openclaw-plugin/src/store.ts
 *
 * Selection/chip mutations never send (INV-1). Multi-session isolation (FR-010).
 * SLC-3: prepare/admit with preparationId; admitted archive for tools after chip clear.
 */

import {
  admitSend,
  admitSelection,
  attachSelection,
  buildCompactNextTurnContext,
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

export type PrepareSendResult =
  | {
      ok: true;
      batch: VisualBatch;
      preparationId: string;
      revision: number;
      compactContext: string;
    }
  | {
      ok: false;
      code: "unavailable_context" | "stale_batch" | "invalid_batch_state";
      message: string;
      batch?: VisualBatch;
    };

export type SendOutcomeResult =
  | {
      ok: true;
      batch: VisualBatch;
      state: string;
      admitted: boolean;
      compactContext: string | null;
    }
  | {
      ok: false;
      code: "stale_preparation" | "invalid_batch_state";
      message: string;
      batch?: VisualBatch;
    };

export class VisualBatchStore {
  private readonly batches = new Map<string, VisualBatch>();
  /** Last admitted batch per session — tools read this after chips clear (SCN-021). */
  private readonly admittedBySession = new Map<string, VisualBatch>();
  /** Pending compact text keyed by preparationId (never enqueued until admit). */
  private readonly pendingCompact = new Map<string, string>();
  /** Completed outcomes for C-011 idempotency. */
  private readonly completedOutcomes = new Map<
    string,
    { admitted: boolean; compactContext: string | null }
  >();

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

  getAdmitted(agentId: string, sessionKey: string): VisualBatch | undefined {
    return this.admittedBySession.get(this.key(agentId, sessionKey));
  }

  /**
   * Active context for tools: preparing/sent working batch, else last admitted archive.
   */
  getActiveContextBatch(agentId: string, sessionKey: string): VisualBatch | undefined {
    const current = this.get(agentId, sessionKey);
    if (current && (current.state === "preparing" || current.state === "sent") && current.selections.length > 0) {
      return current;
    }
    const admitted = this.getAdmitted(agentId, sessionKey);
    if (admitted && admitted.selections.length > 0) {
      return admitted;
    }
    return undefined;
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

  /**
   * Replace an existing selection by id while preserving its id (C-008).
   * Returns undefined when the selection is absent.
   */
  replaceSelection(
    agentId: string,
    sessionKey: string,
    selectionId: string,
    input: SelectionDraftInput,
  ): StoreAttachResult | undefined {
    const current = this.ensureDraft(agentId, sessionKey);
    const index = current.selections.findIndex((s) => s.id === selectionId);
    if (index < 0) {
      return undefined;
    }
    const admitted = admitSelection(input, selectionId);
    const selections = [...current.selections];
    selections[index] = admitted;
    const batch: VisualBatch = {
      ...current,
      selections,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.batches.set(this.key(agentId, sessionKey), batch);
    return { batch, selection: admitted, deduped: true };
  }

  clear(agentId: string, sessionKey: string): VisualBatch {
    const current = this.getOrCreate(agentId, sessionKey);
    const next = clearVisualBatch(current);
    this.batches.set(this.key(agentId, sessionKey), next);
    return next;
  }

  /**
   * C-010: prepare draft for Send. Does not enqueue next-turn injection (RISK-004).
   */
  prepareSend(
    agentId: string,
    sessionKey: string,
    expectedRevision?: number,
  ): PrepareSendResult {
    const current = this.get(agentId, sessionKey) ?? this.getOrCreate(agentId, sessionKey);
    if (current.selections.length === 0) {
      return {
        ok: false,
        code: "unavailable_context",
        message: "Kein Visual-Kontext zum Senden — zuerst eine Selektion anhängen",
        batch: current,
      };
    }
    if (current.state !== "draft") {
      return {
        ok: false,
        code: "invalid_batch_state",
        message: `Batch ist nicht im Entwurf (Status: ${current.state})`,
        batch: current,
      };
    }
    if (expectedRevision !== undefined && expectedRevision !== current.revision) {
      return {
        ok: false,
        code: "stale_batch",
        message: "Batch ist veraltet — bitte Selektionen aktualisieren und erneut senden",
        batch: current,
      };
    }
    try {
      const next = prepareSend(current);
      const preparationId = next.preparationId;
      if (!preparationId) {
        return {
          ok: false,
          code: "invalid_batch_state",
          message: "Vorbereitung fehlgeschlagen — bitte erneut versuchen",
          batch: current,
        };
      }
      const compactContext = buildCompactNextTurnContext(next);
      this.batches.set(this.key(agentId, sessionKey), next);
      this.pendingCompact.set(preparationId, compactContext);
      return {
        ok: true,
        batch: next,
        preparationId,
        revision: next.revision,
        compactContext,
      };
    } catch {
      return {
        ok: false,
        code: "invalid_batch_state",
        message: "Ungültiger Batch-Status für Send-Vorbereitung",
        batch: current,
      };
    }
  }

  /**
   * C-011: admit or reject a preparation. Idempotent for the same preparationId+outcome.
   * On admit: archives batch for tools, replaces working store with empty draft (SCN-021).
   * Never enqueues injection here — caller enqueues only when admitted === true.
   */
  completeSend(
    agentId: string,
    sessionKey: string,
    preparationId: string,
    admitted: boolean,
  ): SendOutcomeResult {
    const key = this.key(agentId, sessionKey);
    const prior = this.completedOutcomes.get(preparationId);
    if (prior) {
      if (prior.admitted !== admitted) {
        return {
          ok: false,
          code: "stale_preparation",
          message: "Send-Vorbereitung ist abgelaufen oder ungültig — bitte erneut senden",
        };
      }
      const batch = this.get(agentId, sessionKey) ?? this.getOrCreate(agentId, sessionKey);
      return {
        ok: true,
        batch,
        state: prior.admitted ? "sent" : batch.state,
        admitted: prior.admitted,
        compactContext: prior.compactContext,
      };
    }

    const current = this.get(agentId, sessionKey);
    if (!current) {
      return {
        ok: false,
        code: "stale_preparation",
        message: "Send-Vorbereitung nicht gefunden — bitte erneut senden",
      };
    }

    if (current.state !== "preparing" || current.preparationId !== preparationId) {
      return {
        ok: false,
        code: "stale_preparation",
        message: "Send-Vorbereitung ist abgelaufen oder ungültig — bitte erneut senden",
        batch: current,
      };
    }

    const compactContext =
      this.pendingCompact.get(preparationId) ?? buildCompactNextTurnContext(current);

    if (admitted) {
      const sent = admitSend(current);
      this.admittedBySession.set(key, sent);
      this.pendingCompact.delete(preparationId);
      this.completedOutcomes.set(preparationId, {
        admitted: true,
        compactContext,
      });
      const fresh = createVisualBatch(sessionKey, agentId);
      this.batches.set(key, fresh);
      return {
        ok: true,
        batch: fresh,
        state: "sent",
        admitted: true,
        compactContext,
      };
    }

    const rejected = rejectSend(current);
    this.pendingCompact.delete(preparationId);
    this.completedOutcomes.set(preparationId, {
      admitted: false,
      compactContext: null,
    });
    this.batches.set(key, rejected);
    return {
      ok: true,
      batch: rejected,
      state: rejected.state,
      admitted: false,
      compactContext: null,
    };
  }

  /**
   * Admit path used by agent_turn_prepare fallback when host Send ran without UI wrap.
   * Archives chips for tools and clears the working draft.
   */
  admitDraftForTurn(agentId: string, sessionKey: string): {
    batch: VisualBatch;
    compactContext: string;
  } | undefined {
    const current = this.get(agentId, sessionKey);
    if (!current || current.selections.length === 0) {
      return undefined;
    }
    if (current.state !== "draft" && current.state !== "preparing") {
      return undefined;
    }

    let preparing = current;
    if (current.state === "draft") {
      const prepared = this.prepareSend(agentId, sessionKey);
      if (!prepared.ok) {
        return undefined;
      }
      preparing = prepared.batch;
    }

    const preparationId = preparing.preparationId;
    if (!preparationId) {
      return undefined;
    }
    const outcome = this.completeSend(agentId, sessionKey, preparationId, true);
    if (!outcome.ok || !outcome.compactContext) {
      return undefined;
    }
    const admitted = this.getAdmitted(agentId, sessionKey);
    if (!admitted) {
      return undefined;
    }
    return { batch: admitted, compactContext: outcome.compactContext };
  }

  /** Explicit Send path only — prepare then admit or reject (legacy test helper). */
  beginPrepare(agentId: string, sessionKey: string): VisualBatch {
    const result = this.prepareSend(agentId, sessionKey);
    if (!result.ok) {
      throw new Error(result.message);
    }
    return result.batch;
  }

  /** Project compact JSON for session extension (no large DOM). Chip UI hides sent archives. */
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
    if (!batch || batch.state === "sent" || batch.state === "cleared" || batch.state === "expired") {
      return { state: batch?.state ?? "empty", selectionCount: 0, selections: [] };
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
    const key = this.key(agentId, sessionKey);
    const batch = this.batches.get(key);
    if (batch?.preparationId) {
      this.pendingCompact.delete(batch.preparationId);
      this.completedOutcomes.delete(batch.preparationId);
    }
    this.batches.delete(key);
    this.admittedBySession.delete(key);
  }

  /** Test helper: count stored session keys. */
  size(): number {
    return this.batches.size;
  }

  /** Test helper: whether a preparation still has pending compact text. */
  hasPendingPreparation(preparationId: string): boolean {
    return this.pendingCompact.has(preparationId);
  }

  findBySessionKey(sessionKey: string): VisualBatch | undefined {
    for (const batch of this.batches.values()) {
      if (batch.sessionKey === sessionKey) {
        return batch;
      }
    }
    return undefined;
  }

  findAdmittedBySessionKey(sessionKey: string): VisualBatch | undefined {
    for (const batch of this.admittedBySession.values()) {
      if (batch.sessionKey === sessionKey) {
        return batch;
      }
    }
    return undefined;
  }
}
