/**
 * Static adapter-boundary architecture check (FR-031 / SCN-024 / INV-5).
 * Location: scripts/check-adapter-boundary.mjs
 *
 * Fails with file:line on forbidden imports. Used by CI and node:test.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "dist-ext", ".git", "coverage"]);

/** Matches ESM/CJS imports of OpenClaw packages or deep paths. */
const OPENCLAW_IMPORT =
  /(?:from\s+|import\s*\(|require\s*\()\s*['"](?:openclaw(?:\/[^'"]*)?|@openclaw\/[^'"]+)['"]/;

/** Matches Chrome / WebExtension API usage (not @types/chrome imports alone). */
const CHROME_API =
  /(?:^|[^.\w])(?:chrome|browser)\.(?:runtime|tabs|storage|sidePanel|scripting|action|alarms|notifications|cookies|webNavigation|debugger)\b/;

/** Matches ambient Chrome type references that imply extension coupling. */
const CHROME_TYPES_IMPORT =
  /(?:from\s+|import\s*\(|require\s*\()\s*['"](?:chrome|@types\/chrome)['"]/;

/**
 * @typedef {{ id: string, root: string, forbidOpenClaw: boolean, forbidChrome: boolean }} PackageRule
 */

/** @type {PackageRule[]} */
export const DEFAULT_PACKAGE_RULES = [
  { id: "core", root: "packages/core/src", forbidOpenClaw: true, forbidChrome: true },
  { id: "protocol", root: "packages/protocol/src", forbidOpenClaw: true, forbidChrome: true },
  {
    id: "domscribe-adapter",
    root: "packages/domscribe-adapter/src",
    forbidOpenClaw: true,
    forbidChrome: true,
  },
  { id: "extension", root: "packages/extension/src", forbidOpenClaw: true, forbidChrome: false },
  {
    id: "mcp-adapter",
    root: "packages/mcp-adapter/src",
    forbidOpenClaw: true,
    forbidChrome: true,
  },
];

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walkSourceFiles(dir, out) {
  if (!fs.existsSync(dir)) {
    return;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) {
        continue;
      }
      walkSourceFiles(full, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name);
    if (!SOURCE_EXT.has(ext)) {
      continue;
    }
    out.push(full);
  }
}

/**
 * @param {string} filePath
 * @param {string} content
 * @param {PackageRule} rule
 * @returns {{ file: string, line: number, rule: string, match: string }[]}
 */
function findViolationsInFile(filePath, content, rule) {
  /** @type {{ file: string, line: number, rule: string, match: string }[]} */
  const found = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      // Keep simple: still scan non-comment-only lines; block comments with code are rare.
    }
    if (rule.forbidOpenClaw && OPENCLAW_IMPORT.test(line)) {
      const m = line.match(OPENCLAW_IMPORT);
      found.push({
        file: filePath,
        line: i + 1,
        rule: "no-openclaw-import",
        match: (m?.[0] ?? "openclaw").trim(),
      });
    }
    if (rule.forbidChrome) {
      if (CHROME_API.test(line)) {
        const m = line.match(CHROME_API);
        found.push({
          file: filePath,
          line: i + 1,
          rule: "no-chrome-api",
          match: (m?.[0] ?? "chrome").trim(),
        });
      }
      if (CHROME_TYPES_IMPORT.test(line)) {
        const m = line.match(CHROME_TYPES_IMPORT);
        found.push({
          file: filePath,
          line: i + 1,
          rule: "no-chrome-types-import",
          match: (m?.[0] ?? "chrome").trim(),
        });
      }
    }
  }
  return found;
}

/**
 * @param {{ rootDir?: string, packageRules?: PackageRule[] }} [options]
 * @returns {{ ok: boolean, violations: { file: string, line: number, rule: string, match: string, packageId: string }[], scannedFiles: number }}
 */
export function checkAdapterBoundary(options = {}) {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  const packageRules = options.packageRules ?? DEFAULT_PACKAGE_RULES;
  /** @type {{ file: string, line: number, rule: string, match: string, packageId: string }[]} */
  const violations = [];
  let scannedFiles = 0;

  for (const rule of packageRules) {
    const absRoot = path.isAbsolute(rule.root) ? rule.root : path.join(rootDir, rule.root);
    /** @type {string[]} */
    const files = [];
    walkSourceFiles(absRoot, files);
    for (const file of files) {
      scannedFiles += 1;
      const content = fs.readFileSync(file, "utf8");
      const hits = findViolationsInFile(file, content, rule);
      for (const hit of hits) {
        violations.push({
          ...hit,
          file: path.relative(rootDir, hit.file),
          packageId: rule.id,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations, scannedFiles };
}

/**
 * @param {{ ok: boolean, violations: { file: string, line: number, rule: string, match: string, packageId: string }[], scannedFiles: number }} result
 * @param {{ rootDir?: string }} [options]
 * @returns {number} process exit code
 */
export function reportAdapterBoundary(result, options = {}) {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  if (result.ok) {
    console.log(
      `adapter-boundary: OK (${String(result.scannedFiles)} files under ${path.relative(process.cwd(), rootDir) || "."})`,
    );
    return 0;
  }
  console.error(`adapter-boundary: FAIL (${String(result.violations.length)} violation(s))`);
  for (const v of result.violations) {
    console.error(`  ${v.file}:${String(v.line)} [${v.packageId}] ${v.rule}: ${v.match}`);
  }
  return 1;
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = checkAdapterBoundary();
  process.exitCode = reportAdapterBoundary(result);
}
