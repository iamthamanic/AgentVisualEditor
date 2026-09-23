/**
 * SLC-7 adapter-boundary + license notice tests (FR-031 / SCN-024 / T-028).
 * Location: scripts/test/adapter-boundary.test.mjs
 */

import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkAdapterBoundary,
  DEFAULT_PACKAGE_RULES,
} from "../check-adapter-boundary.mjs";
import { checkLicenseNotices } from "../check-license-notices.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const FIXTURES = path.join(ROOT, "scripts/fixtures/boundary-violations");

describe("adapter boundary (FR-031 / SCN-024)", () => {
  it("passes on real packages/core|protocol|extension|domscribe|mcp-adapter sources", () => {
    const result = checkAdapterBoundary({ rootDir: ROOT });
    assert.equal(result.ok, true, JSON.stringify(result.violations, null, 2));
    assert.ok(result.scannedFiles > 0);
  });

  it("fails when core sources import OpenClaw SDK", () => {
    const result = checkAdapterBoundary({
      rootDir: ROOT,
      packageRules: [
        {
          id: "core-fixture",
          root: path.join(FIXTURES),
          forbidOpenClaw: true,
          forbidChrome: false,
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.some(
        (v) => v.rule === "no-openclaw-import" && v.file.includes("core-openclaw-import"),
      ),
      JSON.stringify(result.violations),
    );
  });

  it("fails when core sources use chrome.* APIs", () => {
    const result = checkAdapterBoundary({
      rootDir: ROOT,
      packageRules: [
        {
          id: "core-fixture",
          root: path.join(FIXTURES),
          forbidOpenClaw: false,
          forbidChrome: true,
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.some(
        (v) => v.rule === "no-chrome-api" && v.file.includes("core-chrome-api"),
      ),
      JSON.stringify(result.violations),
    );
  });

  it("fails when extension sources import OpenClaw SDK", () => {
    const result = checkAdapterBoundary({
      rootDir: ROOT,
      packageRules: [
        {
          id: "extension-fixture",
          root: path.join(FIXTURES),
          forbidOpenClaw: true,
          forbidChrome: false,
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.violations.some(
        (v) =>
          v.rule === "no-openclaw-import" && v.file.includes("extension-openclaw-import"),
      ),
      JSON.stringify(result.violations),
    );
  });

  it("default rules cover core, protocol, domscribe-adapter, extension, mcp-adapter", () => {
    const ids = DEFAULT_PACKAGE_RULES.map((r) => r.id).sort();
    assert.deepEqual(ids, [
      "core",
      "domscribe-adapter",
      "extension",
      "mcp-adapter",
      "protocol",
    ]);
  });
});

describe("license notices (T-028)", () => {
  it("finds LICENSE and THIRD_PARTY_NOTICES.md with required MIT strings", () => {
    const result = checkLicenseNotices({ rootDir: ROOT });
    assert.equal(result.ok, true, JSON.stringify(result));
  });
});
