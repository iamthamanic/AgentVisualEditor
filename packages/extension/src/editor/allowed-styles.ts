/**
 * Allowlisted CSS properties for controlled preview edits (FR-014 / BR-009).
 * Location: packages/extension/src/editor/allowed-styles.ts
 */

export const ALLOWED_STYLE_PROPERTIES = [
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "gap",
  "row-gap",
  "column-gap",
  "border",
  "border-width",
  "border-style",
  "border-color",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "background",
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "display",
  "flex-direction",
  "justify-content",
  "align-items",
  "grid-template-columns",
  "grid-template-rows",
] as const;

export type AllowedStyleProperty = (typeof ALLOWED_STYLE_PROPERTIES)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_STYLE_PROPERTIES);

export function isAllowedStyleProperty(property: string): property is AllowedStyleProperty {
  return ALLOWED_SET.has(property);
}

/** Reject empty / script-like values before browser apply. */
export function isSafeCssValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 256) {
    return false;
  }
  // No url(), expression, or javascript: in preview values.
  if (/url\s*\(|expression\s*\(|javascript:/i.test(trimmed)) {
    return false;
  }
  return true;
}
