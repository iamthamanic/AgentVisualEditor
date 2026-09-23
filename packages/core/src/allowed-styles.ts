/**
 * Allowlisted CSS properties for controlled preview edits (FR-014 / FR-024 / BR-009).
 * Location: packages/core/src/allowed-styles.ts
 *
 * Shared by extension Design tab and agent apply_preview (server + client enforce).
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

/** Reject empty / script-like / breakout values before browser apply. */
export function isSafeCssValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 256) {
    return false;
  }
  // Block stylesheet breakout (`; { } \ @`) and C0/DEL control chars.
  if (/[;{}\\@]/.test(trimmed)) {
    return false;
  }
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return false;
    }
  }
  // No url(), expression, javascript:, image-set(), element(), attr(), or binding/behavior.
  if (
    /url\s*\(|expression\s*\(|javascript:|image-set\s*\(|element\s*\(|attr\s*\(|-moz-binding|behavior\s*:/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  return true;
}

export type PreviewStyleInput = {
  property: string;
  value: string;
};

export type StyleValidationOk = {
  ok: true;
  styles: Array<{ property: AllowedStyleProperty; value: string }>;
};

export type StyleValidationErr = {
  ok: false;
  code: "forbidden_property";
  message: string;
  property?: string;
};

/** Server-side allowlist enforcement for C-015 (BR-009). */
export function validatePreviewStyles(
  styles: readonly PreviewStyleInput[],
): StyleValidationOk | StyleValidationErr {
  if (styles.length === 0) {
    return {
      ok: false,
      code: "forbidden_property",
      message: "Keine Styles angegeben",
    };
  }
  const validated: Array<{ property: AllowedStyleProperty; value: string }> = [];
  for (const style of styles) {
    if (!isAllowedStyleProperty(style.property)) {
      return {
        ok: false,
        code: "forbidden_property",
        message: `CSS-Property nicht erlaubt: ${style.property}`,
        property: style.property,
      };
    }
    if (!isSafeCssValue(style.value)) {
      return {
        ok: false,
        code: "forbidden_property",
        message: `Ungültiger CSS-Wert für ${style.property}`,
        property: style.property,
      };
    }
    validated.push({ property: style.property, value: style.value.trim() });
  }
  return { ok: true, styles: validated };
}
