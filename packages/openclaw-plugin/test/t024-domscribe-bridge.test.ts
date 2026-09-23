/**
 * T-024 / T-013: bridge selection resolves via Domscribe fixture or degrades.
 * Location: packages/openclaw-plugin/test/t024-domscribe-bridge.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMemoryLookup,
  createSourceResolver,
  DOMSCRIBE_FIXTURE_ENTRIES,
  fixtureLookup,
  statusLabelDe,
} from "@agent-visual-editor/domscribe-adapter";
import { ActiveSessionTracker } from "../dist/active-session.js";
import { BridgeMessageHandler } from "../dist/bridge-handler.js";
import { PairingStore } from "../dist/pairing.js";
import { toBatchDto } from "../dist/project-batch.js";
import { VisualBatchStore } from "../dist/store.js";

function pairedHandler(sourceResolver: ReturnType<typeof createSourceResolver>) {
  const store = new VisualBatchStore();
  const sessions = new ActiveSessionTracker();
  sessions.report({
    sessionKey: "session-ds",
    agentId: "agent-1",
    title: "Domscribe",
  });
  const pairing = new PairingStore();
  const started = pairing.start();
  assert.ok(started.ok);
  if (!started.ok) {
    throw new Error("pairing start failed");
  }
  const completed = pairing.complete({
    code: started.code,
    extensionInstanceId: "ext-ds",
    protocolVersion: 1,
  });
  assert.ok(completed.ok);
  if (!completed.ok) {
    throw new Error("pairing complete failed");
  }
  const connection = pairing.authenticateToken(completed.token);
  assert.ok(connection);
  if (!connection) {
    throw new Error("auth failed");
  }
  const handler = new BridgeMessageHandler({
    store,
    sessions,
    connection,
    sourceResolver,
  });
  return { handler, store };
}

describe("T-024 bridge + Domscribe fixture", () => {
  it("selection.create resolves Component · file:line chip", async () => {
    const resolver = createSourceResolver({ lookup: fixtureLookup() });
    const { handler, store } = pairedHandler(resolver);

    const created = await handler.handleRaw({
      type: "selection.create",
      protocolVersion: 1,
      requestId: "ds-1",
      page: { url: "http://localhost:3000/", title: "CostMyBusiness" },
      element: {
        tag: "button",
        selector: "#hero > button",
        textSummary: "Angebot berechnen",
        dataDs: "A81F09",
      },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.sourceFreshness, "fresh");

    const batch = store.snapshot("agent-1", "session-ds");
    assert.equal(batch.selections.length, 1);
    const sel = batch.selections[0];
    assert.ok(sel);
    assert.equal(sel.source?.component, "OrderButton");
    assert.equal(sel.source?.file, "src/features/order/OrderButton.tsx");
    assert.equal(sel.source?.line, 42);
    assert.equal(sel.source?.resolver, "domscribe");

    const dto = toBatchDto(batch);
    assert.equal(dto.selections[0]?.label, "OrderButton · src/features/order/OrderButton.tsx:42");
    assert.equal(statusLabelDe(resolver.lastStatus()), "Quellzuordnung verfügbar");
  });
});

describe("T-013 bridge degraded without relay", () => {
  it("attaches selection with unavailable mapping and German status", async () => {
    const resolver = createSourceResolver({
      lookup: createMemoryLookup(DOMSCRIBE_FIXTURE_ENTRIES, { probe: "unavailable" }),
    });
    const { handler, store } = pairedHandler(resolver);

    const created = await handler.handleRaw({
      type: "selection.create",
      protocolVersion: 1,
      requestId: "ds-dead",
      page: { url: "https://shop.example/" },
      element: {
        tag: "button",
        selector: "#cta",
        textSummary: "Buy",
        dataDs: "A81F09",
      },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.sourceFreshness, "unavailable");

    const batch = store.snapshot("agent-1", "session-ds");
    assert.equal(batch.selections.length, 1);
    const sel = batch.selections[0];
    assert.ok(sel);
    assert.equal(sel.source?.freshness, "unavailable");
    assert.equal(sel.source?.file, undefined);
    // Chip falls back to tag · text (not pretending exact source).
    assert.equal(toBatchDto(batch).selections[0]?.label, "button · Buy");
    assert.equal(statusLabelDe(resolver.statusFor("https://shop.example/")), "Quellzuordnung nicht verfügbar");
  });
});
