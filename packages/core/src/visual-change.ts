/**
 * VisualChange merge / status helpers for preview editing (FR-014..FR-017).
 * Location: packages/core/src/visual-change.ts
 */

import { CHANGE_VALUE_MAX_BYTES, utf8ByteLength } from "./limits.js";
import { PayloadTooLargeError } from "./errors.js";
import { redactText } from "./redact.js";
import type { VisualChange, VisualChangeKind, VisualChangeStatus } from "./types.js";

export function createChangeId(): string {
  return `ave_chg_${crypto.randomUUID().replace(/-/g, "")}`;
}

function clipValue(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactText(value);
  if (utf8ByteLength(redacted) > CHANGE_VALUE_MAX_BYTES) {
    throw new PayloadTooLargeError("changeValue", CHANGE_VALUE_MAX_BYTES, utf8ByteLength(redacted));
  }
  return redacted;
}

export function createVisualChange(input: {
  id?: string;
  kind: VisualChangeKind;
  property?: string;
  path?: string;
  oldValue?: string;
  newValue?: string;
  status?: VisualChangeStatus;
}): VisualChange {
  const change: VisualChange = {
    id: input.id ?? createChangeId(),
    kind: input.kind,
    status: input.status ?? "pending",
  };
  if (input.property !== undefined) {
    change.property = input.property;
  }
  if (input.path !== undefined) {
    change.path = input.path;
  }
  const oldValue = clipValue(input.oldValue);
  if (oldValue !== undefined) {
    change.oldValue = oldValue;
  }
  const newValue = clipValue(input.newValue);
  if (newValue !== undefined) {
    change.newValue = newValue;
  }
  return change;
}

/** Upsert by id; returns a new array. */
export function upsertVisualChange(
  changes: readonly VisualChange[],
  change: VisualChange,
): VisualChange[] {
  const idx = changes.findIndex((c) => c.id === change.id);
  if (idx < 0) {
    return [...changes, change];
  }
  const next = [...changes];
  next[idx] = change;
  return next;
}

export function markChangeStatus(
  changes: readonly VisualChange[],
  changeId: string,
  status: VisualChangeStatus,
): VisualChange[] {
  return changes.map((c) => (c.id === changeId ? { ...c, status } : c));
}

export function revertAllPending(changes: readonly VisualChange[]): VisualChange[] {
  return changes.map((c) =>
    c.status === "pending" || c.status === "in_progress" ? { ...c, status: "reverted" as const } : c,
  );
}

export function pendingChanges(changes: readonly VisualChange[]): VisualChange[] {
  return changes.filter((c) => c.status === "pending" || c.status === "in_progress");
}
