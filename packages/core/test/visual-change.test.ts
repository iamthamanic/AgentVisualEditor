/**
 * Core VisualChange helpers (FR-014..FR-017).
 * Location: packages/core/test/visual-change.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createVisualChange,
  markChangeResolved,
  markChangeStatus,
  pendingChanges,
  revertAllPending,
  upsertStylePreviewChange,
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

  it("markChangeResolved is idempotent (C-016)", () => {
    const a = createVisualChange({
      kind: "style",
      property: "color",
      oldValue: "#000",
      newValue: "#111",
    });
    let list = upsertVisualChange([], a);
    const once = markChangeResolved(list, a.id);
    assert.ok(once);
    assert.equal(once?.[0]?.status, "resolved");
    const twice = markChangeResolved(once ?? [], a.id);
    assert.ok(twice);
    assert.equal(twice?.[0]?.status, "resolved");
    assert.equal(markChangeResolved(list, "missing"), undefined);
  });

  it("upsertStylePreviewChange latest wins by property", () => {
    let list = upsertStylePreviewChange([], {
      property: "padding",
      oldValue: "0",
      newValue: "4px",
    });
    const firstId = list[0]?.id;
    list = upsertStylePreviewChange(list, {
      property: "padding",
      oldValue: "0",
      newValue: "8px",
    });
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, firstId);
    assert.equal(list[0]?.newValue, "8px");
    assert.equal(list[0]?.status, "pending");
  });
});
