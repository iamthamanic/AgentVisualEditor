/**
 * Core VisualChange helpers (FR-014..FR-017).
 * Location: packages/core/test/visual-change.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVisualChange,
  markChangeStatus,
  pendingChanges,
  revertAllPending,
  upsertVisualChange,
} from "../dist/visual-change.js";

describe("VisualChange helpers", () => {
  it("upserts and reverts pending changes", () => {
    const a = createVisualChange({
      kind: "style",
      property: "padding",
      oldValue: "0",
      newValue: "8px",
    });
    const b = createVisualChange({
      kind: "comment",
      property: "comment",
      newValue: "bitte enger",
    });
    let list = upsertVisualChange([], a);
    list = upsertVisualChange(list, b);
    assert.equal(pendingChanges(list).length, 2);
    list = markChangeStatus(list, a.id, "reverted");
    assert.equal(pendingChanges(list).length, 1);
    list = revertAllPending(list);
    assert.equal(pendingChanges(list).length, 0);
    assert.equal(list.every((c) => c.status === "reverted"), true);
  });
});
