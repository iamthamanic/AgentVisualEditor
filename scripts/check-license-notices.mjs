/**
 * T-028 license notice scan (D-002 / D-003 / §18 criterion 8).
 * Location: scripts/check-license-notices.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");

/**
 * @typedef {{ path: string, mustInclude: string[] }} NoticeRequirement
 */

/** @type {NoticeRequirement[]} */
export const DEFAULT_NOTICE_REQUIREMENTS = [
  {
    path: "LICENSE",
    mustInclude: ["MIT License", "Permission is hereby granted"],
  },
  {
    path: "THIRD_PARTY_NOTICES.md",
    mustInclude: [
      "Design Mode",
      "Domscribe",
      "MIT",
      "D-002",
      "D-003",
    ],
  },
];

/**
 * @param {{ rootDir?: string, requirements?: NoticeRequirement[] }} [options]
 * @returns {{ ok: boolean, missing: string[], failures: string[] }}
 */
export function checkLicenseNotices(options = {}) {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  const requirements = options.requirements ?? DEFAULT_NOTICE_REQUIREMENTS;
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const failures = [];

  for (const req of requirements) {
    const abs = path.join(rootDir, req.path);
    if (!fs.existsSync(abs)) {
      missing.push(req.path);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    for (const needle of req.mustInclude) {
      if (!text.includes(needle)) {
        failures.push(`${req.path}: missing required text ${JSON.stringify(needle)}`);
      }
    }
  }

  return { ok: missing.length === 0 && failures.length === 0, missing, failures };
}

/**
 * @param {{ ok: boolean, missing: string[], failures: string[] }} result
 * @returns {number}
 */
export function reportLicenseNotices(result) {
  if (result.ok) {
    console.log("license-notices: OK (LICENSE + THIRD_PARTY_NOTICES.md)");
    return 0;
  }
  console.error("license-notices: FAIL");
  for (const m of result.missing) {
    console.error(`  missing file: ${m}`);
  }
  for (const f of result.failures) {
    console.error(`  ${f}`);
  }
  return 1;
}

const isMain =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = checkLicenseNotices();
  process.exitCode = reportLicenseNotices(result);
}
