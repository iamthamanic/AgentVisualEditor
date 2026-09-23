/**
 * T-004: pairing lifecycle + bridge selection → store (no send).
 * Location: packages/openclaw-plugin/test/t004-pairing-bridge.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ActiveSessionTracker } from "../dist/active-session.js";
import { BridgeMessageHandler } from "../dist/bridge-handler.js";
import { PairingStore } from "../dist/pairing.js";
import { VisualBatchStore } from "../dist/store.js";

describe("T-004 pairing + bridge selection", () => {
  it("pairs, authenticates scoped token, and revokes (INV-4)", () => {
    const pairing = new PairingStore(() => 1_000_000);
    const started = pairing.start("Chrome");
    assert.equal(started.ok, true);
    if (!started.ok) return;

    const denied = pairing.complete({
      code: "NOTREAL1",
      extensionInstanceId: "ext-a",
      protocolVersion: 1,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "invalid_code");
    }

    const completed = pairing.complete({
      code: started.code,
      extensionInstanceId: "ext-a",
      extensionLabel: "Chrome",
      protocolVersion: 1,
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;

    assert.match(completed.token, /^ave_/);
    assert.equal(completed.bridgePath, "/agent-visual-editor/bridge");

    // One-time code cannot be reused.
    const replay = pairing.complete({
      code: started.code,
      extensionInstanceId: "ext-b",
      protocolVersion: 1,
    });
    assert.equal(replay.ok, false);

    const auth = pairing.authenticateToken(completed.token);
    assert.ok(auth);
    assert.equal(auth?.connectionId, completed.connectionId);

    // Not a Gateway bearer — scoped prefix only.
    assert.equal(completed.token.includes("gateway"), false);
    assert.equal(completed.token.startsWith("Bearer"), false);

    const revoked = pairing.revoke(completed.connectionId);
    assert.equal(revoked.ok, true);
    assert.equal(pairing.authenticateToken(completed.token), undefined);
  });

  it("expires pairing codes", () => {
    let now = 1_000;
    const pairing = new PairingStore(() => now, 100);
    const started = pairing.start();
    assert.equal(started.ok, true);
    if (!started.ok) return;
    now = 1_500;
    const expired = pairing.complete({
      code: started.code,
      extensionInstanceId: "ext-x",
      protocolVersion: 1,
    });
    assert.equal(expired.ok, false);
    if (!expired.ok) {
      assert.equal(expired.code, "expired_code");
    }
  });

  it("selection.create attaches chip for exact active session without send", async () => {
    const store = new VisualBatchStore();
    const sessions = new ActiveSessionTracker();
    sessions.report({
      sessionKey: "session-a",
      agentId: "agent-1",
      title: "UI Fix",
    });

    const pairing = new PairingStore();
    const started = pairing.start();
    assert.ok(started.ok);
    if (!started.ok) return;
    const completed = pairing.complete({
      code: started.code,
      extensionInstanceId: "ext-1",
      protocolVersion: 1,
    });
    assert.ok(completed.ok);
    if (!completed.ok) return;
    const connection = pairing.authenticateToken(completed.token);
    assert.ok(connection);
    if (!connection) return;

    let sendCalls = 0;
    const handler = new BridgeMessageHandler({
      store,
      sessions,
      connection,
      onBatchChanged: () => {
        sendCalls += 1;
      },
    });

    const created = await handler.handleRaw({
      type: "selection.create",
      protocolVersion: 1,
      requestId: "req-1",
      page: { url: "http://localhost:3000/", title: "Demo" },
      element: { tag: "button", selector: "#cta", textSummary: "Kaufen" },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.ok("selectionId" in created);

    const batch = store.snapshot("agent-1", "session-a");
    assert.equal(batch.selections.length, 1);
    assert.equal(batch.state, "draft");
    assert.equal(sendCalls, 1); // batch-changed callback only — not agent send

    // requestId dedupe
    const again = await handler.handleRaw({
      type: "selection.create",
      protocolVersion: 1,
      requestId: "req-1",
      page: { url: "http://localhost:3000/" },
      element: { tag: "button", selector: "#cta", textSummary: "Kaufen" },
    });
    assert.deepEqual(again, created);
    assert.equal(store.snapshot("agent-1", "session-a").selections.length, 1);

    const removed = await handler.handleRaw({
      type: "selection.remove",
      protocolVersion: 1,
      requestId: "req-2",
      selectionId: created.selectionId,
    });
    assert.equal(removed.ok, true);
    assert.equal(store.snapshot("agent-1", "session-a").selections.length, 0);
  });

  it("fail-closed without active session", async () => {
    const store = new VisualBatchStore();
    const sessions = new ActiveSessionTracker();
    const pairing = new PairingStore();
    const started = pairing.start();
    assert.ok(started.ok);
    if (!started.ok) return;
    const completed = pairing.complete({
      code: started.code,
      extensionInstanceId: "ext-1",
      protocolVersion: 1,
    });
    assert.ok(completed.ok);
    if (!completed.ok) return;
    const connection = pairing.authenticateToken(completed.token);
    assert.ok(connection);
    if (!connection) return;

    const handler = new BridgeMessageHandler({ store, sessions, connection });
    const result = await handler.handleRaw({
      type: "selection.create",
      protocolVersion: 1,
      requestId: "req-no-session",
      page: { url: "http://localhost/" },
      element: { tag: "div", selector: "#x" },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "no_active_session");
    }
    assert.equal(store.size(), 0);
  });
});
