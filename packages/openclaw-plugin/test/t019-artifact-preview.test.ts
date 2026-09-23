/**
 * SLC-5: C-009 artifact.upload, VisualChange update, size caps, INV-1.
 * Location: packages/openclaw-plugin/test/t019-artifact-preview.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCREENSHOT_MAX_BYTES } from "@agent-visual-editor/core";
import { ActiveSessionTracker } from "../dist/active-session.js";
import { ArtifactStore } from "../dist/artifact-store.js";
import { BridgeMessageHandler } from "../dist/bridge-handler.js";
import { PairingStore } from "../dist/pairing.js";
import { VisualBatchStore } from "../dist/store.js";

/** Tiny valid 1×1 PNG */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function tinyPngBuffer(): Buffer {
  return Buffer.from(TINY_PNG_BASE64, "base64");
}

async function pairedHandler(opts?: {
  previewEditingEnabled?: boolean;
  artifacts?: ArtifactStore;
}) {
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
  if (!started.ok) throw new Error("pairing start failed");
  const completed = pairing.complete({
    code: started.code,
    extensionInstanceId: "ext-1",
    protocolVersion: 1,
  });
  assert.ok(completed.ok);
  if (!completed.ok) throw new Error("pairing complete failed");
  const connection = pairing.authenticateToken(completed.token);
  assert.ok(connection);
  if (!connection) throw new Error("auth failed");

  const artifacts = opts?.artifacts ?? new ArtifactStore();
  const handler = new BridgeMessageHandler({
    store,
    sessions,
    connection,
    artifacts,
    previewEditingEnabled: opts?.previewEditingEnabled ?? true,
  });

  const created = await handler.handleRaw({
    type: "selection.create",
    protocolVersion: 1,
    requestId: "req-create",
    page: { url: "http://localhost:3000/", title: "Demo" },
    element: { tag: "button", selector: "#cta", textSummary: "Kaufen" },
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("create failed");
  return { handler, store, sessions, artifacts, selectionId: created.selectionId };
}

describe("T-019 / C-009 artifact + preview changes", () => {
  it("uploads bounded PNG artifact by selectionId with TTL metadata", async () => {
    const { handler, artifacts, selectionId } = await pairedHandler();
    const png = tinyPngBuffer();
    const uploaded = await handler.handleRaw({
      type: "artifact.upload",
      protocolVersion: 1,
      requestId: "req-art-1",
      selectionId,
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: png.byteLength,
      pngBase64: TINY_PNG_BASE64,
      kind: "viewport",
      pageUrl: "http://localhost:3000/",
      capturedAt: "2026-09-24T10:00:00.000Z",
    });
    assert.equal(uploaded.ok, true);
    if (!uploaded.ok) return;
    assert.ok("artifactId" in uploaded);
    assert.equal(uploaded.kind, "viewport");
    assert.equal(uploaded.capturedAt, "2026-09-24T10:00:00.000Z");
    assert.ok(Date.parse(uploaded.expiresAt) > Date.now() - 1000);

    // EDGE-013: page mutation does not drop historical artifact
    const stored = artifacts.get(uploaded.artifactId);
    assert.ok(stored);
    assert.equal(stored?.pageUrl, "http://localhost:3000/");
    assert.equal(stored?.capturedAt, "2026-09-24T10:00:00.000Z");
  });

  it("rejects oversized screenshot with too_large (EDGE-011)", async () => {
    const { handler, selectionId } = await pairedHandler();
    const oversized = Buffer.alloc(SCREENSHOT_MAX_BYTES + 1, 0x89);
    // Force PNG magic so invalid_type is not chosen first
    oversized[0] = 0x89;
    oversized[1] = 0x50;
    oversized[2] = 0x4e;
    oversized[3] = 0x47;
    const result = await handler.handleRaw({
      type: "artifact.upload",
      protocolVersion: 1,
      requestId: "req-art-big",
      selectionId,
      mime: "image/png",
      width: 100,
      height: 100,
      byteSize: oversized.byteLength,
      pngBase64: oversized.toString("base64"),
      kind: "element",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "too_large");
    }
  });

  it("dedupes by contentHash+selectionId and requestId", async () => {
    const { handler, selectionId } = await pairedHandler();
    const png = tinyPngBuffer();
    const first = await handler.handleRaw({
      type: "artifact.upload",
      protocolVersion: 1,
      requestId: "req-dedupe-a",
      selectionId,
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: png.byteLength,
      pngBase64: TINY_PNG_BASE64,
      kind: "viewport",
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const second = await handler.handleRaw({
      type: "artifact.upload",
      protocolVersion: 1,
      requestId: "req-dedupe-b",
      selectionId,
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: png.byteLength,
      pngBase64: TINY_PNG_BASE64,
      kind: "viewport",
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.artifactId, first.artifactId);
    assert.equal(second.deduped, true);

    const replay = await handler.handleRaw({
      type: "artifact.upload",
      protocolVersion: 1,
      requestId: "req-dedupe-a",
      selectionId,
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: png.byteLength,
      pngBase64: TINY_PNG_BASE64,
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.artifactId, first.artifactId);
  });

  it("merges VisualChange via selection.update without send (INV-1)", async () => {
    const { handler, store, selectionId } = await pairedHandler();
    let sendCalls = 0;
    // onBatchChanged is not send — assert store still draft
    const updated = await handler.handleRaw({
      type: "selection.update",
      protocolVersion: 1,
      requestId: "req-chg-1",
      selectionId,
      change: {
        id: "chg-1",
        kind: "style",
        property: "padding",
        oldValue: "0px",
        newValue: "16px",
        status: "pending",
      },
    });
    assert.equal(updated.ok, true);
    void sendCalls;
    const batch = store.get("agent-1", "session-a");
    assert.ok(batch);
    assert.equal(batch?.state, "draft");
    const sel = batch?.selections.find((s) => s.id === selectionId);
    assert.equal(sel?.changes.length, 1);
    assert.equal(sel?.changes[0]?.newValue, "16px");
  });

  it("forbids artifact.upload when previewEditingEnabled=false", async () => {
    const { handler, selectionId } = await pairedHandler({ previewEditingEnabled: false });
    const png = tinyPngBuffer();
    const result = await handler.handleRaw({
      type: "artifact.upload",
      protocolVersion: 1,
      requestId: "req-off",
      selectionId,
      mime: "image/png",
      width: 1,
      height: 1,
      byteSize: png.byteLength,
      pngBase64: TINY_PNG_BASE64,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "forbidden");
    }
  });
});
