/**
 * PreviewChangeTracker undo/redo/revert/clear (FR-016) + keyboard + screenshot caps.
 * Location: packages/extension/test/preview-editing.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PreviewChangeTracker } from "../dist/editor/change-tracker.js";
import { isSafeCssValue, isAllowedStyleProperty } from "../dist/editor/allowed-styles.js";
import { boundPngDataUrl, SCREENSHOT_MAX_BYTES } from "../dist/editor/screenshot-bounds.js";
import { isEditableFocusTarget } from "../dist/editor/keyboard.js";

describe("PreviewChangeTracker (SCN-010 / FR-016)", () => {
  it("tracks style apply, undo, redo, per-change revert, and clear-all", () => {
    const tracker = new PreviewChangeTracker();
    const a = tracker.applyStyle("padding", "0px", "8px");
    const b = tracker.applyStyle("border-radius", "0", "12px");
    assert.equal(tracker.pending().length, 2);
    assert.equal(a.newValue, "8px");
    assert.equal(b.property, "border-radius");

    const undone = tracker.undo();
    assert.ok(undone?.revert);
    assert.equal(undone?.revert?.property, "border-radius");
    assert.equal(tracker.pending().length, 1);

    const redone = tracker.redo();
    assert.ok(redone?.apply);
    assert.equal(tracker.pending().length, 2);

    const reverted = tracker.revert(a.id);
    assert.ok(reverted);
    assert.equal(reverted?.status, "reverted");
    assert.equal(tracker.pending().length, 1);

    const cleared = tracker.clearAll();
    assert.equal(cleared.length, 1);
    assert.equal(tracker.pending().length, 0);
  });

  it("upserts same style property instead of duplicating", () => {
    const tracker = new PreviewChangeTracker();
    const first = tracker.applyStyle("color", "#000", "#111");
    const second = tracker.applyStyle("color", "#000", "#222");
    assert.equal(first.id, second.id);
    assert.equal(tracker.list().length, 1);
    assert.equal(tracker.list()[0]?.newValue, "#222");
    assert.equal(tracker.list()[0]?.oldValue, "#000");
  });

  it("stores comment as pending VisualChange (FR-017)", () => {
    const tracker = new PreviewChangeTracker();
    const c = tracker.applyComment("mach den Button größer");
    assert.equal(c.kind, "comment");
    assert.equal(c.newValue, "mach den Button größer");
  });
});

describe("allowed styles + screenshot bounds", () => {
  it("allowlists spacing/radius/color/typography properties", () => {
    assert.equal(isAllowedStyleProperty("padding"), true);
    assert.equal(isAllowedStyleProperty("border-radius"), true);
    assert.equal(isAllowedStyleProperty("background-color"), true);
    assert.equal(isAllowedStyleProperty("font-size"), true);
    assert.equal(isAllowedStyleProperty("position"), false);
    assert.equal(isSafeCssValue("8px"), true);
    assert.equal(isSafeCssValue("url(javascript:alert(1))"), false);
  });

  it("rejects oversized screenshot payloads (EDGE-011)", () => {
    // Approximate base64 that would decode > 2 MiB
    const huge = "A".repeat(Math.ceil((SCREENSHOT_MAX_BYTES * 4) / 3) + 16);
    const result = boundPngDataUrl(huge);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "too_large");
    }
  });
});

describe("keyboard focus guard (T-023 / EDGE-017)", () => {
  it("treats input/textarea/contenteditable as editable", () => {
    assert.equal(isEditableFocusTarget(null), false);
    assert.equal(
      isEditableFocusTarget({ tagName: "INPUT", readOnly: false, disabled: false }),
      true,
    );
    assert.equal(
      isEditableFocusTarget({ tagName: "TEXTAREA", readOnly: false, disabled: false }),
      true,
    );
    assert.equal(isEditableFocusTarget({ tagName: "DIV", isContentEditable: true }), true);
    assert.equal(isEditableFocusTarget({ tagName: "DIV", isContentEditable: false }), false);
  });
});
