/**
 * T-002: multi-session isolation — no cross-session migration.
 * Location: packages/core/test/t002-multi-session-isolation.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachSelection,
  createVisualBatch,
  sessionStoreKey,
} from "../dist/index.js";

describe("T-002 multi-session isolation", () => {
  it("keeps batches keyed by session identity without migrating chips", () => {
    let batchA = createVisualBatch("session-a", "agent-1");
    let batchB = createVisualBatch("session-b", "agent-1");

    batchA = attachSelection(batchA, {
      pageUrl: "http://localhost/",
      tag: "button",
      selector: "#a",
      textSummary: "A",
    }).batch;

    batchB = attachSelection(batchB, {
      pageUrl: "http://localhost/",
      tag: "div",
      selector: "#b",
      textSummary: "B",
    }).batch;

    assert.equal(batchA.selections.length, 1);
    assert.equal(batchB.selections.length, 1);
    assert.equal(batchA.selections[0]?.selector, "#a");
    assert.equal(batchB.selections[0]?.selector, "#b");
    assert.notEqual(batchA.id, batchB.id);
    assert.equal(sessionStoreKey("agent-1", "session-a"), "agent-1::session-a");
    assert.notEqual(
      sessionStoreKey("agent-1", "session-a"),
      sessionStoreKey("agent-1", "session-b"),
    );
  });

  it("isolates same sessionKey across different agents", () => {
    let batch1 = createVisualBatch("shared", "agent-1");
    let batch2 = createVisualBatch("shared", "agent-2");
    batch1 = attachSelection(batch1, {
      pageUrl: "http://localhost/",
      tag: "span",
      selector: "#one",
      textSummary: "one",
    }).batch;
    assert.equal(batch2.selections.length, 0);
    assert.equal(batch1.selections.length, 1);
  });
});
