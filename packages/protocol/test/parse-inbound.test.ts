/**
 * Protocol parseInbound coverage for C-001..C-009 schemas.
 * Location: packages/protocol/test/parse-inbound.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROTOCOL_VERSION,
  parseConnectionRevoke,
  parseInbound,
  parsePairingComplete,
  parsePairingStart,
} from "../dist/index.js";

describe("protocol parseInbound", () => {
  it("exports PROTOCOL_VERSION = 1", () => {
    assert.equal(PROTOCOL_VERSION, 1);
  });

  it("accepts bridge.hello (C-004)", () => {
    const result = parseInbound({
      type: "bridge.hello",
      protocolVersion: 1,
      requestId: "req-hello",
      extensionInstanceId: "ext-1",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.message.type, "bridge.hello");
    }
  });

  it("accepts selection.create (C-006)", () => {
    const result = parseInbound({
      type: "selection.create",
      protocolVersion: 1,
      requestId: "req-1",
      page: { url: "http://localhost:3000/" },
      element: { tag: "button", selector: "#btn", textSummary: "Go" },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.message.type, "selection.create");
    }
  });

  it("accepts selection.remove (C-007)", () => {
    const result = parseInbound({
      type: "selection.remove",
      protocolVersion: 1,
      requestId: "req-2",
      selectionId: "ave_sel_1",
    });
    assert.equal(result.ok, true);
  });

  it("accepts selection.update (C-008)", () => {
    const result = parseInbound({
      type: "selection.update",
      protocolVersion: 1,
      requestId: "req-3",
      selectionId: "ave_sel_1",
      revision: 2,
    });
    assert.equal(result.ok, true);
  });

  it("accepts artifact.upload (C-009)", () => {
    const result = parseInbound({
      type: "artifact.upload",
      protocolVersion: 1,
      requestId: "req-4",
      selectionId: "ave_sel_1",
      mime: "image/png",
      width: 100,
      height: 80,
      byteSize: 1024,
      pngBase64: "iVBORw0KGgo=",
      kind: "viewport",
    });
    assert.equal(result.ok, true);
  });

  it("accepts preview.apply.result (C-015)", () => {
    const result = parseInbound({
      type: "preview.apply.result",
      protocolVersion: 1,
      requestId: "apply_1",
      selectionId: "ave_sel_1",
      ok: true,
      applied: [{ property: "padding", value: "8px", oldValue: "0px" }],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.message.type, "preview.apply.result");
    }
  });

  it("rejects invalid messages with ErrorEnvelope", () => {
    const result = parseInbound({ type: "selection.create" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "invalid_message");
      assert.equal(result.error.ok, false);
    }
  });

  it("accepts pairing.start / complete / revoke request shapes", () => {
    const start = parsePairingStart({
      type: "pairing.start",
      protocolVersion: 1,
      label: "Chrome",
    });
    assert.equal(start.ok, true);

    const complete = parsePairingComplete({
      type: "pairing.complete",
      protocolVersion: 1,
      code: "ABC123",
      extensionInstanceId: "ext-1",
    });
    assert.equal(complete.ok, true);

    const revoke = parseConnectionRevoke({
      type: "connection.revoke",
      protocolVersion: 1,
      connectionId: "conn-1",
    });
    assert.equal(revoke.ok, true);
  });
});
