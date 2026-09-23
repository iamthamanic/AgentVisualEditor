/**
 * Agent preview stylesheet executor — allowlist before DOM (BR-009).
 * Location: packages/extension/test/agent-preview.test.ts
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  handleAgentPreviewMessage,
  resetAgentPreviewForTests,
} from "../dist/content/agent-preview.js";

describe("agent preview executor (C-015)", () => {
  beforeEach(() => {
    resetAgentPreviewForTests();
  });

  it("rejects forbidden property without mutating", () => {
    const result = handleAgentPreviewMessage({
      type: "agent_preview_apply",
      selectionId: "sel_1",
      selector: "#x",
      styles: [{ property: "position", value: "fixed" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok && "code" in result) {
      assert.equal(result.code, "forbidden_property");
    }
  });

  it("rejects unsafe css value", () => {
    const result = handleAgentPreviewMessage({
      type: "agent_preview_apply",
      selectionId: "sel_1",
      selector: "#x",
      styles: [{ property: "background-color", value: "url(javascript:alert(1))" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok && "code" in result) {
      assert.equal(result.code, "forbidden_property");
    }
  });

  it("rejects background shorthand property", () => {
    const result = handleAgentPreviewMessage({
      type: "agent_preview_apply",
      selectionId: "sel_1",
      selector: "#x",
      styles: [{ property: "background", value: "red" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok && "code" in result) {
      assert.equal(result.code, "forbidden_property");
    }
  });

  it("rejects CSS breakout values", () => {
    const result = handleAgentPreviewMessage({
      type: "agent_preview_apply",
      selectionId: "sel_1",
      selector: "#x",
      styles: [{ property: "color", value: "red; } * { display: none" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok && "code" in result) {
      assert.equal(result.code, "forbidden_property");
    }
  });

  it("clear is ok without document", () => {
    const result = handleAgentPreviewMessage({
      type: "agent_preview_clear",
      selectionId: "sel_1",
    });
    assert.equal(result.ok, true);
  });
});
