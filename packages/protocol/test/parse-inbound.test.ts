/**
 * Protocol parseInbound coverage for C-006..C-009 schemas.
 * Location: packages/protocol/test/parse-inbound.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PROTOCOL_VERSION, parseInbound } from "../dist/index.js";

describe("protocol parseInbound", () => {
  it("exports PROTOCOL_VERSION = 1", () => {
    assert.equal(PROTOCOL_VERSION, 1);
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
    });
    assert.equal(result.ok, true);
  });

  it("rejects invalid messages with ErrorEnvelope", () => {
    const result = parseInbound({ type: "selection.create" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "invalid_message");
      assert.equal(result.error.ok, false);
    }
  });
});
