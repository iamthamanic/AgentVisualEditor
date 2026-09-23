/**
 * T-025: next-turn visual context exact + cross-session tool deny.
 * Location: packages/openclaw-plugin/test/t025-send-context-tools.test.ts
 *
 * SCN-004 / SCN-021 / SCN-022 / C-012..C-014
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCompactNextTurnContext } from "@agent-visual-editor/core";
import { bindSessionIdentity } from "../dist/session-binding.js";
import { VisualBatchStore } from "../dist/store.js";
import { toBatchDto } from "../dist/project-batch.js";
import { toActiveContextDto, toSelectionDetailDto } from "../dist/tool-payloads.js";

describe("T-025 next-turn context + cross-session tools", () => {
  it("admits exact session context and clears chips (SCN-021)", () => {
    const store = new VisualBatchStore();
    const attached = store.attach("agent-1", "session-a", {
      pageUrl: "http://localhost:3000/",
      tag: "button",
      selector: "#hero > button",
      textSummary: "Angebot berechnen",
      source: {
        resolver: "manual",
        freshness: "fresh",
        component: "OrderButton",
        file: "src/features/order/OrderButton.tsx",
        line: 42,
      },
    });

    const prepared = store.prepareSend("agent-1", "session-a");
    assert.equal(prepared.ok, true);
    if (!prepared.ok) {
      return;
    }

    assert.ok(prepared.compactContext.includes(prepared.batch.id));
    assert.ok(prepared.compactContext.includes(attached.selection.id));
    assert.ok(prepared.compactContext.includes("OrderButton"));
    assert.ok(prepared.compactContext.includes("untrusted user/page data"));
    assert.equal(prepared.compactContext.includes("<html"), false);

    const outcome = store.completeSend(
      "agent-1",
      "session-a",
      prepared.preparationId,
      true,
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) {
      return;
    }
    assert.equal(outcome.admitted, true);
    assert.ok(outcome.compactContext);
    assert.equal(outcome.compactContext, prepared.compactContext);

    const working = store.snapshot("agent-1", "session-a");
    assert.equal(working.selections.length, 0);
    assert.equal(toBatchDto(working).selectionCount, 0);

    const admitted = store.getAdmitted("agent-1", "session-a");
    assert.ok(admitted);
    assert.equal(admitted.state, "sent");
    assert.equal(admitted.selections.length, 1);
    assert.equal(admitted.sessionKey, "session-a");
    assert.equal(admitted.agentId, "agent-1");

    const rebuilt = buildCompactNextTurnContext(admitted);
    assert.ok(rebuilt.includes(admitted.id));
  });

  it("tools return active context only for the caller session (SCN-018)", () => {
    const store = new VisualBatchStore();
    const a = store.attach("agent-1", "session-a", {
      pageUrl: "http://localhost/",
      tag: "button",
      selector: "#a",
      textSummary: "A",
    });
    store.attach("agent-1", "session-b", {
      pageUrl: "http://localhost/",
      tag: "div",
      selector: "#b",
      textSummary: "B",
    });

    const prepA = store.prepareSend("agent-1", "session-a");
    assert.equal(prepA.ok, true);
    if (!prepA.ok) {
      return;
    }
    store.completeSend("agent-1", "session-a", prepA.preparationId, true);

    const contextA = store.getActiveContextBatch("agent-1", "session-a");
    assert.ok(contextA);
    const dto = toActiveContextDto(contextA);
    assert.equal(dto.sessionKey, "session-a");
    assert.equal(dto.selectionCount, 1);
    assert.equal(dto.selections[0]?.id, a.selection.id);

    const selection = contextA.selections[0];
    assert.ok(selection);
    const detail = toSelectionDetailDto(contextA, selection);
    assert.equal(detail.id, a.selection.id);
    assert.equal(detail.batchId, contextA.id);

    // Session B still draft — no admitted archive crossover
    assert.equal(store.getAdmitted("agent-1", "session-b"), undefined);
    const draftB = store.getActiveContextBatch("agent-1", "session-b");
    // Draft without preparing/sent does not count as active tool context
    assert.equal(draftB, undefined);
  });

  it("cross-session tool binding is denied (SCN-022 / INV-3)", () => {
    const denied = bindSessionIdentity({
      requestedSessionKey: "session-a",
      requestedAgentId: "agent-1",
      contextSessionKey: "session-b",
      contextAgentId: "agent-1",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "forbidden");
      assert.match(denied.message, /Cross-Session/i);
    }

    const missing = bindSessionIdentity({});
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, "no_session_context");
    }

    const store = new VisualBatchStore();
    store.attach("agent-1", "session-a", {
      pageUrl: "http://localhost/",
      tag: "button",
      selector: "#a",
      textSummary: "secret-a",
    });
    const prep = store.prepareSend("agent-1", "session-a");
    assert.equal(prep.ok, true);
    if (!prep.ok) {
      return;
    }
    store.completeSend("agent-1", "session-a", prep.preparationId, true);

    // Exact identity only
    const own = store.getActiveContextBatch("agent-1", "session-a");
    assert.ok(own);
    assert.equal(store.getActiveContextBatch("agent-2", "session-a"), undefined);
    assert.equal(store.getActiveContextBatch("agent-1", "session-b"), undefined);
  });

  it("session delete retires admitted archive (EDGE-005)", () => {
    const store = new VisualBatchStore();
    store.attach("agent-1", "session-a", {
      pageUrl: "http://localhost/",
      tag: "span",
      selector: "#x",
      textSummary: "x",
    });
    const prep = store.prepareSend("agent-1", "session-a");
    assert.equal(prep.ok, true);
    if (!prep.ok) {
      return;
    }
    store.completeSend("agent-1", "session-a", prep.preparationId, true);
    assert.ok(store.getAdmitted("agent-1", "session-a"));

    store.deleteSession("agent-1", "session-a");
    assert.equal(store.get("agent-1", "session-a"), undefined);
    assert.equal(store.getAdmitted("agent-1", "session-a"), undefined);
    assert.equal(store.getActiveContextBatch("agent-1", "session-a"), undefined);
  });
});
