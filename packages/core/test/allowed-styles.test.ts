/**
 * Allowlisted CSS property validation (FR-024 / BR-009).
 * Location: packages/core/test/allowed-styles.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAllowedStyleProperty,
  isSafeCssValue,
  validatePreviewStyles,
} from "../dist/allowed-styles.js";

describe("allowed styles (BR-009)", () => {
  it("allowlists spacing/radius/color/typography; rejects position", () => {
    assert.equal(isAllowedStyleProperty("padding"), true);
    assert.equal(isAllowedStyleProperty("border-radius"), true);
    assert.equal(isAllowedStyleProperty("background-color"), true);
    assert.equal(isAllowedStyleProperty("font-size"), true);
    assert.equal(isAllowedStyleProperty("position"), false);
    assert.equal(isSafeCssValue("8px"), true);
    assert.equal(isSafeCssValue("url(javascript:alert(1))"), false);
  });

  it("validatePreviewStyles rejects forbidden property", () => {
    const bad = validatePreviewStyles([{ property: "position", value: "fixed" }]);
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.equal(bad.code, "forbidden_property");
      assert.equal(bad.property, "position");
    }
    const good = validatePreviewStyles([{ property: "padding", value: "8px" }]);
    assert.equal(good.ok, true);
    if (good.ok) {
      assert.equal(good.styles[0]?.property, "padding");
    }
  });
});
