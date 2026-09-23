/**
 * MCP adapter placeholder readiness (FR-031 / SCN-024).
 * Location: packages/mcp-adapter/test/placeholder.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MCP_ADAPTER_CORE_CONTRACT,
  MCP_ADAPTER_STATUS,
} from "../dist/index.js";

describe("mcp-adapter placeholder", () => {
  it("exports placeholder status for SLC-7 boundary slice", () => {
    assert.equal(MCP_ADAPTER_STATUS, "placeholder");
  });

  it("lists core contract names without importing OpenClaw or Chrome", () => {
    assert.ok(MCP_ADAPTER_CORE_CONTRACT.includes("VisualSelection"));
    assert.ok(MCP_ADAPTER_CORE_CONTRACT.includes("VisualChange"));
    assert.equal(MCP_ADAPTER_CORE_CONTRACT.length, 4);
  });
});
