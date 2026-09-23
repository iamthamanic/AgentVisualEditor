/**
 * Placeholder package for the generic MCP adapter (SLC-7 / FR-031).
 * Location: packages/mcp-adapter/src/index.ts
 *
 * Boundary-ready: depends on nothing host-specific. A future MCP server should
 * import `@agent-visual-editor/core` + `@agent-visual-editor/protocol` only —
 * never OpenClaw SDK types or Chrome APIs (SCN-024 / INV-5).
 */

export const MCP_ADAPTER_STATUS: "placeholder" = "placeholder";

/** Documented surface the future adapter will wrap (selection / change / screenshot). */
export const MCP_ADAPTER_CORE_CONTRACT = [
  "VisualSelection",
  "VisualBatch",
  "VisualChange",
  "ScreenshotArtifact",
] as const;

export type McpAdapterCoreContractName = (typeof MCP_ADAPTER_CORE_CONTRACT)[number];
