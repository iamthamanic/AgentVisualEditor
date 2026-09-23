/**
 * T-005: session targeting + canonical send path (mocked host).
 * Location: packages/openclaw-plugin/test/t005-session-targeting-send.test.ts
 *
 * INV-1: attach never calls send. FR-019/FR-020: setDraft/send only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VisualBatchStore } from "../dist/store.js";
import { bindSessionIdentity } from "../dist/session-binding.js";
import { toBatchDto } from "../dist/project-batch.js";

describe("T-005 session targeting + canonical send", () => {
  it("fail-closed without session identity (INV-3)", () => {
    const missing = bindSessionIdentity({});
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, "no_session_context");
    }
  });

  it("request-only without host context is no_session_context (INV-3)", () => {
    const denied = bindSessionIdentity({
      requestedSessionKey: "session-a",
      requestedAgentId: "agent-1",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "no_session_context");
    }
  });

  it("rejects cross-session requests (INV-3)", () => {
    const denied = bindSessionIdentity({
      requestedSessionKey: "session-a",
      requestedAgentId: "agent-1",
      contextSessionKey: "session-b",
      contextAgentId: "agent-1",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "forbidden");
    }
  });

  it("isolates chips across two sessions", () => {
    const store = new VisualBatchStore();
    store.attach("agent-1", "session-a", {
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

    const a = store.snapshot("agent-1", "session-a");
    const b = store.snapshot("agent-1", "session-b");
    assert.equal(a.selections.length, 1);
    assert.equal(b.selections.length, 1);
    assert.equal(a.selections[0]?.selector, "#a");
    assert.equal(b.selections[0]?.selector, "#b");
    assert.equal(store.key("agent-1", "session-a"), "agent-1::session-a");
  });

  it("canonical send path uses prepare/admit/reject without raw chat RPC", async () => {
    const store = new VisualBatchStore();
    store.attach("agent-1", "session-a", {
      pageUrl: "http://localhost/",
      tag: "button",
      selector: "#send",
      textSummary: "Send me",
    });

    let draft = "mach den kleiner";
    const setDraft = (text: string) => {
      draft = text;
    };
    let sendCalls = 0;
    const send = async (): Promise<boolean> => {
      sendCalls += 1;
      const prepared = store.prepareSend("agent-1", "session-a");
      assert.equal(prepared.ok, true);
      if (!prepared.ok) {
        return false;
      }
      if (sendCalls === 1) {
        store.completeSend("agent-1", "session-a", prepared.preparationId, false);
        return false;
      }
      store.completeSend("agent-1", "session-a", prepared.preparationId, true);
      return true;
    };

    assert.equal(sendCalls, 0);
    assert.equal(store.snapshot("agent-1", "session-a").state, "draft");

    setDraft("mach den kleiner");
    const rejected = await send();
    assert.equal(rejected, false);
    assert.equal(store.snapshot("agent-1", "session-a").state, "draft");
    assert.equal(store.snapshot("agent-1", "session-a").selections.length, 1);
    assert.equal(draft, "mach den kleiner");

    const admitted = await send();
    assert.equal(admitted, true);
    assert.equal(store.snapshot("agent-1", "session-a").state, "draft");
    assert.equal(store.snapshot("agent-1", "session-a").selections.length, 0);
    assert.equal(store.getAdmitted("agent-1", "session-a")?.state, "sent");
    assert.equal(sendCalls, 2);

    const dto = toBatchDto(store.snapshot("agent-1", "session-a"));
    assert.equal(dto.selectionCount, 0);
  });
});
