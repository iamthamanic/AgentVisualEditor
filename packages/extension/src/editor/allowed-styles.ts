/**
 * Allowlisted CSS properties for controlled preview edits (FR-014 / BR-009).
 * Location: packages/extension/src/editor/allowed-styles.ts
 *
 * Re-exports shared core allowlist so Design tab and agent apply stay aligned.
 */

export {
  ALLOWED_STYLE_PROPERTIES,
  isAllowedStyleProperty,
  isSafeCssValue,
  validatePreviewStyles,
  type AllowedStyleProperty,
} from "@agent-visual-editor/core";
