/**
 * T-015: rejected send retains draft+chips; preparation cannot leak to a later turn.
 * Location: packages/openclaw-plugin/test/t015-rejected-send.test.ts
 *
 * SCN-014 / RISK-004 / EDGE-009
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCompactNextTurnContext } from "@agent-visual-editor/core";
import { VisualBatchStore } from "../dist/store.js";
import { toBatchDto } from "../dist/project-batch.js";

describe("T-015 rejected send retains chips (SCN-014)", () => {
  it("rejectSend restores draft chips and drops pending preparation", () => {
    const store = new VisualBatchStore();
    store.attach("agent-1", "session-a", {
      pageUrl: "http://localhost/",
      tag: "button",
      selector: "#hero-cta",
      textSummary: "Angebot berechnen",
      source: {
        resolver: "manual",
        freshness: "fresh",
        component: "OrderButton",
        file: "src/OrderButton.tsx",
        line: 42,
      },
    });

    const prepared = store.prepareSend("agent-1", "session-a");
    assert.equal(prepared.ok, true);
    if (!prepared.ok) {
      return;
    }
    assert.equal(store.snapshot("agent-1", "session-a").state, "preparing");
    assert.ok(store.hasPendingPreparation(prepared.preparationId));
    assert.ok(prepared.compactContext.includes(prepared.batch.id));
    assert.ok(prepared.compactContext.includes("untrusted"));

    const rejected = store.completeSend(
      "agent-1",
      "session-a",
      prepared.preparationId,
      false,
    );
    assert.equal(rejected.ok, true);
    if (!rejected.ok) {
      return;
    }
    assert.equal(rejected.admitted, false);
    assert.equal(rejected.compactContext, null);
    assert.equal(store.hasPendingPreparation(prepared.preparationId), false);

    const draft = store.snapshot("agent-1", "session-a");
    assert.equal(draft.state, "draft");
    assert.equal(draft.selections.length, 1);
    assert.equal(draft.preparationId, undefined);
    assert.equal(store.getAdmitted("agent-1", "session-a"), undefined);

    const dto = toBatchDto(draft);
    assert.equal(dto.selectionCount, 1);
    assert.ok(dto.selections[0]?.label.includes("OrderButton"));
  });

  it("rejected preparation cannot be consumed by a later unrelated message", () => {
    const store = new VisualBatchStore();
    store.attach("agent-1", "session-a", {
      pageUrl: "http://localhost/",
      tag: "div",
      selector: "#card",
      textSummary: "Pricing",
    });

    const first = store.prepareSend("agent-1", "session-a");
    assert.equal(first.ok, true);
    if (!first.ok) {
      return;
    }
    const firstPrepId = first.preparationId;
    const firstCompact = first.compactContext;

    store.completeSend("agent-1", "session-a", firstPrepId, false);
    assert.equal(store.hasPendingPreparation(firstPrepId), false);

    // Later unrelated send path with empty outcome attempt on stale prep
    const stale = store.completeSend("agent-1", "session-a", firstPrepId, true);
    assert.equal(stale.ok, false);
    if (stale.ok) {
      return;
    }
    assert.equal(stale.code, "stale_preparation");

    // New message without chips: no admitted archive / no active context
    assert.equal(store.getActiveContextBatch("agent-1", "session-a"), undefined);

    // Re-prepare for a fresh Send uses a new preparationId and fresh compact text id
    const second = store.prepareSend("agent-1", "session-a");
    assert.equal(second.ok, true);
    if (!second.ok) {
      return;
    }
    assert.notEqual(second.preparationId, firstPrepId);
    assert.ok(second.compactContext.includes("AgentVisualEditor context"));
    // Same batch content yields same semantic lines; preparation id differs
    assert.equal(
      buildCompactNextTurnContext(store.snapshot("agent-1", "session-a")).includes(
        store.snapshot("agent-1", "session-a").id,
      ),
      true,
    );
    assert.ok(firstCompact.includes("ave_batch_"));
  });
});
