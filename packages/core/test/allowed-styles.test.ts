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
  it("allowlists spacing/radius/color/typography; rejects position and background shorthand", () => {
    assert.equal(isAllowedStyleProperty("padding"), true);
    assert.equal(isAllowedStyleProperty("border-radius"), true);
    assert.equal(isAllowedStyleProperty("background-color"), true);
    assert.equal(isAllowedStyleProperty("background"), false);
    assert.equal(isAllowedStyleProperty("font-size"), true);
    assert.equal(isAllowedStyleProperty("position"), false);
    assert.equal(isSafeCssValue("8px"), true);
    assert.equal(isSafeCssValue("url(javascript:alert(1))"), false);
  });

  it("rejects CSS breakout and control characters", () => {
    assert.equal(isSafeCssValue("red; } * { display: none"), false);
    assert.equal(isSafeCssValue("blue\\"), false);
    assert.equal(isSafeCssValue("@import"), false);
    assert.equal(isSafeCssValue("a\nb"), false);
    assert.equal(isSafeCssValue("#111"), true);
  });

  it("rejects image-set, element, attr, -moz-binding, and behavior", () => {
    assert.equal(isSafeCssValue("image-set(url(x) 1x)"), false);
    assert.equal(isSafeCssValue("element(#foo)"), false);
    assert.equal(isSafeCssValue("attr(href)"), false);
    assert.equal(isSafeCssValue("-moz-binding: url(x)"), false);
    assert.equal(isSafeCssValue("behavior:url(x.htc)"), false);
    assert.equal(isSafeCssValue("IMAGE-SET(url(x))"), false);
  });

  it("validatePreviewStyles rejects forbidden property", () => {
    const bad = validatePreviewStyles([{ property: "position", value: "fixed" }]);
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.equal(bad.code, "forbidden_property");
      assert.equal(bad.property, "position");
    }
    const shorthand = validatePreviewStyles([{ property: "background", value: "red" }]);
    assert.equal(shorthand.ok, false);
    const good = validatePreviewStyles([{ property: "padding", value: "8px" }]);
    assert.equal(good.ok, true);
    if (good.ok) {
      assert.equal(good.styles[0]?.property, "padding");
    }
  });
});
