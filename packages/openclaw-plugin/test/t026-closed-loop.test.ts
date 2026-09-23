/**
 * SLC-6: C-015 apply_preview + C-016 mark_resolved (FR-024 / FR-025 / BR-009).
 * Location: packages/openclaw-plugin/test/t026-closed-loop.test.ts
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { DEFAULT_AVE_CONFIG, readAveConfig } from "../dist/config.js";
import {
  clearApplyPreviewDedupeForTests,
  runApplyPreview,
  type BrowserPreviewApplier,
} from "../dist/preview-apply.js";
import { VisualBatchStore } from "../dist/store.js";
import { bindSessionIdentity } from "../dist/session-binding.js";

function admitSelection(store: VisualBatchStore, agentId: string, sessionKey: string) {
  const attached = store.attach(agentId, sessionKey, {
    pageUrl: "http://localhost:3000/",
    tag: "button",
    selector: "#hero > button",
    textSummary: "Angebot",
  });
  const prep = store.prepareSend(agentId, sessionKey);
  assert.equal(prep.ok, true);
  if (!prep.ok) {
    throw new Error("prepare failed");
  }
  store.completeSend(agentId, sessionKey, prep.preparationId, true);
  return attached.selection;
}

function mockBrowser(
  outcome:
    | { ok: true; applied: Array<{ property: string; value: string; oldValue?: string }> }
    | { ok: false; code: "stale" | "browser_unavailable" | "forbidden_property"; message: string },
  hasBrowser = true,
): BrowserPreviewApplier {
  return {
    hasBrowser: () => hasBrowser,
    apply: async () => outcome,
  };
}

describe("T-026 closed-loop apply_preview + mark_resolved", () => {
  beforeEach(() => {
    clearApplyPreviewDedupeForTests();
  });

  it("defaults agentPreviewApplyEnabled to false (§19)", () => {
    assert.equal(DEFAULT_AVE_CONFIG.agentPreviewApplyEnabled, false);
    assert.equal(readAveConfig({}).agentPreviewApplyEnabled, false);
    assert.equal(readAveConfig({ agentPreviewApplyEnabled: true }).agentPreviewApplyEnabled, true);
  });

  it("rejects apply when flag is false", async () => {
    const store = new VisualBatchStore();
    const selection = admitSelection(store, "agent-1", "session-a");
    const result = await runApplyPreview({
      enabled: false,
      store,
      agentId: "agent-1",
      sessionKey: "session-a",
      browser: mockBrowser({
        ok: true,
        applied: [{ property: "padding", value: "8px" }],
      }),
      input: {
        selectionId: selection.id,
        styles: [{ property: "padding", value: "8px" }],
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "forbidden");
    }
  });

  it("applies allowlisted styles and records pending VisualChange (C-015)", async () => {
    const store = new VisualBatchStore();
    const selection = admitSelection(store, "agent-1", "session-a");
    const result = await runApplyPreview({
      enabled: true,
      store,
      agentId: "agent-1",
      sessionKey: "session-a",
      browser: mockBrowser({
        ok: true,
        applied: [{ property: "padding", value: "8px", oldValue: "0px" }],
      }),
      input: {
        selectionId: selection.id,
        styles: [{ property: "padding", value: "8px" }],
        requestId: "req-apply-1",
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.uncommittedPreview, true);
    assert.equal(result.applied[0]?.property, "padding");
    assert.ok(result.revision >= 1);

    const ctx = store.getActiveContextBatch("agent-1", "session-a");
    const sel = ctx?.selections.find((s) => s.id === selection.id);
    assert.ok(sel);
    assert.equal(sel?.changes.length, 1);
    assert.equal(sel?.changes[0]?.status, "pending");
    assert.equal(sel?.changes[0]?.property, "padding");
    assert.equal(sel?.changes[0]?.newValue, "8px");
  });

  it("rejects forbidden property server-side (BR-009)", async () => {
    const store = new VisualBatchStore();
    const selection = admitSelection(store, "agent-1", "session-a");
    let browserCalled = false;
    const result = await runApplyPreview({
      enabled: true,
      store,
      agentId: "agent-1",
      sessionKey: "session-a",
      browser: {
        hasBrowser: () => true,
        apply: async () => {
          browserCalled = true;
          return { ok: true, applied: [] };
        },
      },
      input: {
        selectionId: selection.id,
        styles: [{ property: "position", value: "fixed" }],
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "forbidden_property");
    }
    assert.equal(browserCalled, false);
  });

  it("returns browser_unavailable when no paired browser", async () => {
    const store = new VisualBatchStore();
    const selection = admitSelection(store, "agent-1", "session-a");
    const result = await runApplyPreview({
      enabled: true,
      store,
      agentId: "agent-1",
      sessionKey: "session-a",
      browser: mockBrowser(
        { ok: true, applied: [{ property: "padding", value: "8px" }] },
        false,
      ),
      input: {
        selectionId: selection.id,
        styles: [{ property: "padding", value: "8px" }],
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "browser_unavailable");
    }
  });

  it("returns stale from browser executor (SCN-016)", async () => {
    const store = new VisualBatchStore();
    const selection = admitSelection(store, "agent-1", "session-a");
    const result = await runApplyPreview({
      enabled: true,
      store,
      agentId: "agent-1",
      sessionKey: "session-a",
      browser: mockBrowser({
        ok: false,
        code: "stale",
        message: "Selektor veraltet",
      }),
      input: {
        selectionId: selection.id,
        styles: [{ property: "color", value: "#fff" }],
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "stale");
    }
  });

  it("mark_resolved is idempotent and documents BR-008 (C-016)", () => {
    const store = new VisualBatchStore();
    const selection = admitSelection(store, "agent-1", "session-a");
    // Seed a pending change via recordPreviewApply
    const recorded = store.recordPreviewApply("agent-1", "session-a", selection.id, [
      { property: "padding", value: "8px", oldValue: "0" },
    ]);
    assert.equal(recorded.ok, true);
    if (!recorded.ok) return;
    const changeId = recorded.changes[0]?.id;
    assert.ok(changeId);

    const once = store.markResolved("agent-1", "session-a", { changeId });
    assert.equal(once.ok, true);
    if (!once.ok) return;
    assert.equal(once.updatedChangeIds[0], changeId);
    assert.match(once.note, /BR-008/);
    assert.match(once.note, /schreibt keinen Quellcode/i);

    const twice = store.markResolved("agent-1", "session-a", { changeId });
    assert.equal(twice.ok, true);
    if (!twice.ok) return;
    assert.equal(twice.updatedChangeIds[0], changeId);

    const ctx = store.getActiveContextBatch("agent-1", "session-a");
    const change = ctx?.selections[0]?.changes.find((c) => c.id === changeId);
    assert.equal(change?.status, "resolved");
  });

  it("mark_resolved by selectionId resolves all changes", () => {
    const store = new VisualBatchStore();
    const selection = admitSelection(store, "agent-1", "session-a");
    store.recordPreviewApply("agent-1", "session-a", selection.id, [
      { property: "padding", value: "8px" },
      { property: "color", value: "#111" },
    ]);
    const result = store.markResolved("agent-1", "session-a", {
      selectionId: selection.id,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.updatedChangeIds.length, 2);
    const ctx = store.getActiveContextBatch("agent-1", "session-a");
    assert.ok(ctx?.selections[0]?.changes.every((c) => c.status === "resolved"));
  });

  it("cross-session binding denied (INV-3)", () => {
    const denied = bindSessionIdentity({
      contextSessionKey: "session-b",
      contextAgentId: "agent-1",
      requestedSessionKey: "session-a",
      requestedAgentId: "agent-1",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "forbidden");
    }
  });

  it("dedupes identical requestId", async () => {
    const store = new VisualBatchStore();
    const selection = admitSelection(store, "agent-1", "session-a");
    let calls = 0;
    const browser: BrowserPreviewApplier = {
      hasBrowser: () => true,
      apply: async () => {
        calls += 1;
        return {
          ok: true,
          applied: [{ property: "padding", value: "8px" }],
        };
      },
    };
    const first = await runApplyPreview({
      enabled: true,
      store,
      agentId: "agent-1",
      sessionKey: "session-a",
      browser,
      input: {
        selectionId: selection.id,
        styles: [{ property: "padding", value: "8px" }],
        requestId: "same-req",
      },
    });
    const second = await runApplyPreview({
      enabled: true,
      store,
      agentId: "agent-1",
      sessionKey: "session-a",
      browser,
      input: {
        selectionId: selection.id,
        styles: [{ property: "padding", value: "8px" }],
        requestId: "same-req",
      },
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(calls, 1);
  });
});
