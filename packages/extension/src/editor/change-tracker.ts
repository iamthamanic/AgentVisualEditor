/**
 * Undo/redo / revert / clear-all tracker for VisualChange previews (FR-016).
 * Location: packages/extension/src/editor/change-tracker.ts
 *
 * Pure — no DOM, no Send (INV-1).
 */

export type PreviewChangeKind = "style" | "text" | "comment";

export type PreviewChange = {
  id: string;
  kind: PreviewChangeKind;
  property?: string;
  path?: string;
  oldValue?: string;
  newValue?: string;
  status: "pending" | "reverted";
};

export type TrackerAction =
  | { type: "apply"; change: PreviewChange }
  | { type: "revert"; changeId: string; before: PreviewChange }
  | { type: "clear"; before: PreviewChange[] };

function newId(): string {
  return `ave_chg_${crypto.randomUUID().replace(/-/g, "")}`;
}

export class PreviewChangeTracker {
  private changes: PreviewChange[] = [];
  private undoStack: TrackerAction[] = [];
  private redoStack: TrackerAction[] = [];

  list(): PreviewChange[] {
    return this.changes.map((c) => ({ ...c }));
  }

  pending(): PreviewChange[] {
    return this.changes.filter((c) => c.status === "pending");
  }

  /** Fill oldValue after content script reports the pre-apply value. */
  setOldValue(changeId: string, oldValue: string): void {
    const idx = this.changes.findIndex((c) => c.id === changeId);
    if (idx < 0) {
      return;
    }
    const next = [...this.changes];
    next[idx] = { ...next[idx]!, oldValue };
    this.changes = next;
    // Keep undo stack entry in sync for accurate revert.
    for (let i = this.undoStack.length - 1; i >= 0; i -= 1) {
      const action = this.undoStack[i];
      if (action?.type === "apply" && action.change.id === changeId) {
        action.change = { ...action.change, oldValue };
        break;
      }
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  applyStyle(property: string, oldValue: string, newValue: string): PreviewChange {
    const existing = this.changes.find(
      (c) => c.kind === "style" && c.property === property && c.status === "pending",
    );
    const change: PreviewChange = {
      id: existing?.id ?? newId(),
      kind: "style",
      property,
      oldValue: existing?.oldValue ?? oldValue,
      newValue,
      status: "pending",
    };
    this.pushApply(change);
    return { ...change };
  }

  applyText(oldValue: string, newValue: string): PreviewChange {
    const existing = this.changes.find((c) => c.kind === "text" && c.status === "pending");
    const change: PreviewChange = {
      id: existing?.id ?? newId(),
      kind: "text",
      property: "textContent",
      oldValue: existing?.oldValue ?? oldValue,
      newValue,
      status: "pending",
    };
    this.pushApply(change);
    return { ...change };
  }

  applyComment(text: string): PreviewChange {
    const existing = this.changes.find((c) => c.kind === "comment" && c.status === "pending");
    const change: PreviewChange = {
      id: existing?.id ?? newId(),
      kind: "comment",
      property: "comment",
      oldValue: existing?.oldValue ?? "",
      newValue: text,
      status: "pending",
    };
    this.pushApply(change);
    return { ...change };
  }

  /**
   * Revert one change to its oldValue status. Returns the change to apply in DOM.
   */
  revert(changeId: string): PreviewChange | undefined {
    const idx = this.changes.findIndex((c) => c.id === changeId);
    if (idx < 0) {
      return undefined;
    }
    const before = { ...this.changes[idx]! };
    if (before.status === "reverted") {
      return undefined;
    }
    const reverted: PreviewChange = { ...before, status: "reverted" };
    const next = [...this.changes];
    next[idx] = reverted;
    this.changes = next;
    this.undoStack.push({ type: "revert", changeId, before });
    this.redoStack = [];
    return { ...reverted };
  }

  clearAll(): PreviewChange[] {
    const before = this.list();
    if (before.length === 0) {
      return [];
    }
    const pending = before.filter((c) => c.status === "pending");
    this.changes = before.map((c) =>
      c.status === "pending" ? { ...c, status: "reverted" as const } : c,
    );
    this.undoStack.push({ type: "clear", before });
    this.redoStack = [];
    return pending;
  }

  undo(): { apply?: PreviewChange; revert?: PreviewChange; clear?: PreviewChange[] } | undefined {
    const action = this.undoStack.pop();
    if (!action) {
      return undefined;
    }
    this.redoStack.push(action);
    if (action.type === "apply") {
      const idx = this.changes.findIndex((c) => c.id === action.change.id);
      if (idx >= 0) {
        this.changes = this.changes.filter((c) => c.id !== action.change.id);
      }
      return { revert: { ...action.change, status: "reverted" } };
    }
    if (action.type === "revert") {
      const idx = this.changes.findIndex((c) => c.id === action.changeId);
      if (idx >= 0) {
        const next = [...this.changes];
        next[idx] = { ...action.before };
        this.changes = next;
      }
      return { apply: { ...action.before } };
    }
    // clear
    this.changes = action.before.map((c) => ({ ...c }));
    return { clear: action.before.filter((c) => c.status === "pending") };
  }

  redo(): { apply?: PreviewChange; revert?: PreviewChange; clear?: PreviewChange[] } | undefined {
    const action = this.redoStack.pop();
    if (!action) {
      return undefined;
    }
    this.undoStack.push(action);
    if (action.type === "apply") {
      this.upsert(action.change);
      return { apply: { ...action.change } };
    }
    if (action.type === "revert") {
      const idx = this.changes.findIndex((c) => c.id === action.changeId);
      if (idx >= 0) {
        const next = [...this.changes];
        next[idx] = { ...action.before, status: "reverted" };
        this.changes = next;
        return { revert: next[idx] };
      }
      return undefined;
    }
    const pending = action.before.filter((c) => c.status === "pending");
    this.changes = action.before.map((c) =>
      c.status === "pending" ? { ...c, status: "reverted" as const } : c,
    );
    return { clear: pending };
  }

  private pushApply(change: PreviewChange): void {
    this.upsert(change);
    this.undoStack.push({ type: "apply", change: { ...change } });
    this.redoStack = [];
  }

  private upsert(change: PreviewChange): void {
    const idx = this.changes.findIndex((c) => c.id === change.id);
    if (idx < 0) {
      this.changes = [...this.changes, { ...change }];
      return;
    }
    const next = [...this.changes];
    next[idx] = { ...change };
    this.changes = next;
  }
}
