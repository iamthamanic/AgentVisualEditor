/**
 * VisualBatch state machine, attachment, dedup, and send preparation.
 * Location: packages/core/src/batch.ts
 *
 * INV-1: attach/remove/clear never start an agent run — callers must not send.
 */

import { InvalidBatchStateError, LimitReachedError } from "./errors.js";
import { sameStableIdentity, stableIdentityOf } from "./identity.js";
import { MAX_CHIPS_PER_DRAFT } from "./limits.js";
import { admitSelection } from "./selection.js";
import type { SelectionDraftInput, VisualBatch, VisualBatchState, VisualSelection } from "./types.js";

const ALLOWED_TRANSITIONS: Readonly<Record<VisualBatchState, readonly VisualBatchState[]>> = {
  draft: ["preparing", "cleared", "expired"],
  preparing: ["sent", "draft", "expired"],
  sent: ["expired"],
  cleared: [],
  expired: [],
};

export function createBatchId(): string {
  return `ave_batch_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createPreparationId(): string {
  return `ave_prep_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createVisualBatch(sessionKey: string, agentId: string): VisualBatch {
  const now = new Date().toISOString();
  return {
    id: createBatchId(),
    sessionKey,
    agentId,
    state: "draft",
    revision: 0,
    createdAt: now,
    updatedAt: now,
    selections: [],
  };
}

function touch(batch: VisualBatch): VisualBatch {
  return {
    ...batch,
    revision: batch.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function assertTransition(from: VisualBatchState, to: VisualBatchState): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidBatchStateError(from, to);
  }
}

export function transitionBatch(batch: VisualBatch, to: VisualBatchState): VisualBatch {
  assertTransition(batch.state, to);
  const next = touch({
    ...batch,
    state: to,
    selections: [...batch.selections],
  });
  if (to === "sent") {
    next.admittedAt = new Date().toISOString();
  }
  if (to === "cleared") {
    next.selections = [];
  }
  return next;
}

export type AttachResult = {
  batch: VisualBatch;
  selection: VisualSelection;
  deduped: boolean;
};

/**
 * Attach a selection to a draft batch. Dedupes by stable identity (tag+selector+textSummary).
 * Never triggers send (INV-1).
 */
export function attachSelection(batch: VisualBatch, input: SelectionDraftInput): AttachResult {
  if (batch.state !== "draft") {
    throw new InvalidBatchStateError(batch.state, "draft");
  }

  const admitted = admitSelection(input);
  const identity = stableIdentityOf(admitted);
  const existingIndex = batch.selections.findIndex((item) =>
    sameStableIdentity(stableIdentityOf(item), identity)
  );

  if (existingIndex >= 0) {
    const previous = batch.selections[existingIndex];
    if (previous === undefined) {
      throw new Error("Invariant: selection index out of range");
    }
    const updated: VisualSelection = {
      ...admitted,
      id: previous.id,
      changes: admitted.changes.length > 0 ? admitted.changes : previous.changes,
    };
    const selections = [...batch.selections];
    selections[existingIndex] = updated;
    return {
      batch: touch({ ...batch, selections }),
      selection: updated,
      deduped: true,
    };
  }

  if (batch.selections.length >= MAX_CHIPS_PER_DRAFT) {
    throw new LimitReachedError(MAX_CHIPS_PER_DRAFT);
  }

  const selections = [...batch.selections, admitted];
  return {
    batch: touch({ ...batch, selections }),
    selection: admitted,
    deduped: false,
  };
}

export function removeSelection(batch: VisualBatch, selectionId: string): VisualBatch {
  if (batch.state !== "draft" && batch.state !== "preparing") {
    throw new InvalidBatchStateError(batch.state, batch.state);
  }
  const selections = batch.selections.filter((item) => item.id !== selectionId);
  return touch({ ...batch, selections });
}

export function clearVisualBatch(batch: VisualBatch): VisualBatch {
  if (batch.state === "cleared") {
    return batch;
  }
  if (batch.state === "draft" || batch.state === "preparing") {
    return transitionBatch(batch, "cleared");
  }
  throw new InvalidBatchStateError(batch.state, "cleared");
}

/**
 * Move draft → preparing for an explicit user Send (C-010).
 * Pins one preparationId to the current batch revision.
 * Caller must ensure selections.length > 0 (unavailable_context otherwise).
 */
export function prepareSend(batch: VisualBatch): VisualBatch {
  const next = transitionBatch(batch, "preparing");
  return {
    ...next,
    preparationId: createPreparationId(),
  };
}

/** Admit a prepared batch as sent; clears preparationId. */
export function admitSend(batch: VisualBatch): VisualBatch {
  const next = transitionBatch(batch, "sent");
  const { preparationId: _cleared, ...rest } = next;
  return rest;
}

/**
 * Reject a preparing send: return to draft keeping chips (SCN-014).
 * Clears preparationId so a later turn cannot consume this preparation (RISK-004).
 */
export function rejectSend(batch: VisualBatch): VisualBatch {
  const next = transitionBatch(batch, "draft");
  const { preparationId: _cleared, ...rest } = next;
  return rest;
}

export function expireBatch(batch: VisualBatch): VisualBatch {
  if (batch.state === "expired") {
    return batch;
  }
  return transitionBatch(batch, "expired");
}

export function sessionStoreKey(agentId: string, sessionKey: string): string {
  return `${agentId}::${sessionKey}`;
}
