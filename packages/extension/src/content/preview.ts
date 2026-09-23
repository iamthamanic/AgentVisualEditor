/**
 * Content-script preview apply/revert for transient CSS/text (FR-014..FR-016).
 * Location: packages/extension/src/content/preview.ts
 *
 * Never sends — DOM-only overrides (INV-1 / BR-008).
 */

import { isAllowedStyleProperty, isSafeCssValue } from "../editor/allowed-styles.js";

export type PreviewApplyStyle = {
  type: "preview_apply_style";
  selector: string;
  property: string;
  value: string;
};

export type PreviewApplyText = {
  type: "preview_apply_text";
  selector: string;
  value: string;
};

export type PreviewRevertStyle = {
  type: "preview_revert_style";
  selector: string;
  property: string;
  oldValue: string;
};

export type PreviewRevertText = {
  type: "preview_revert_text";
  selector: string;
  oldValue: string;
};

export type PreviewClearAll = {
  type: "preview_clear_all";
  selector: string;
  styles: Array<{ property: string; oldValue: string }>;
  textOldValue?: string;
};

export type PreviewMessage =
  | PreviewApplyStyle
  | PreviewApplyText
  | PreviewRevertStyle
  | PreviewRevertText
  | PreviewClearAll;

export type PreviewResult =
  | { ok: true; oldValue?: string }
  | { ok: false; message: string };

function resolve(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export function handlePreviewMessage(message: PreviewMessage): PreviewResult {
  const el = resolve(message.selector);
  if (!el || !(el instanceof HTMLElement)) {
    return { ok: false, message: "Element nicht gefunden (Selektor)" };
  }

  if (message.type === "preview_apply_style") {
    if (!isAllowedStyleProperty(message.property)) {
      return { ok: false, message: "CSS-Property nicht erlaubt" };
    }
    if (!isSafeCssValue(message.value)) {
      return { ok: false, message: "Ungültiger CSS-Wert" };
    }
    const oldValue = el.style.getPropertyValue(message.property) || "";
    el.style.setProperty(message.property, message.value);
    return { ok: true, oldValue };
  }

  if (message.type === "preview_revert_style") {
    if (!isAllowedStyleProperty(message.property)) {
      return { ok: false, message: "CSS-Property nicht erlaubt" };
    }
    if (message.oldValue === "") {
      el.style.removeProperty(message.property);
    } else {
      el.style.setProperty(message.property, message.oldValue);
    }
    return { ok: true };
  }

  if (message.type === "preview_apply_text") {
    const oldValue = el.textContent ?? "";
    el.textContent = message.value;
    return { ok: true, oldValue };
  }

  if (message.type === "preview_revert_text") {
    el.textContent = message.oldValue;
    return { ok: true };
  }

  // clear all
  for (const style of message.styles) {
    if (!isAllowedStyleProperty(style.property)) continue;
    if (style.oldValue === "") {
      el.style.removeProperty(style.property);
    } else {
      el.style.setProperty(style.property, style.oldValue);
    }
  }
  if (message.textOldValue !== undefined) {
    el.textContent = message.textOldValue;
  }
  return { ok: true };
}
