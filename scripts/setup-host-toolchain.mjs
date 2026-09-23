#!/usr/bin/env node
/**
 * Optional host toolchain helper.
 * Stub for OpenClaw host OOM workarounds during plugin build/validate.
 * Prefer exporting PATH to a dedicated Node 26 install before running npm scripts.
 */
import { spawnSync } from "node:child_process";

const nodeBin = process.env.AVE_NODE_BIN ?? process.execPath;
const result = spawnSync(nodeBin, ["--version"], { encoding: "utf8" });
const version = (result.stdout || result.stderr || "").trim();

console.log(`[ave-setup] Node: ${version || "unknown"} (${nodeBin})`);
console.log("[ave-setup] Tip: export PATH=\"$HOME/.local/node26/bin:$PATH\"");
console.log("[ave-setup] If openclaw plugins build OOMs, retry with NODE_OPTIONS=--max-old-space-size=4096");

if (result.status !== 0) {
  process.exitCode = 1;
}
