/**
 * Agent preview style executor (C-015 / RISK-009).
 * Location: packages/extension/src/content/agent-preview.ts
 *
 * Applies allowlisted CSS via HTMLElement.style.setProperty only (no stylesheet
 * string concatenation). Never evaluates JS (BR-009). Clear restores prior values.
 */

import { isAllowedStyleProperty, isSafeCssValue } from "../editor/allowed-styles.js";

export type AgentPreviewApplyMessage = {
  type: "agent_preview_apply";
  selectionId: string;
  selector: string;
  styles: Array<{ property: string; value: string }>;
};

export type AgentPreviewClearMessage = {
  type: "agent_preview_clear";
  selectionId?: string;
};

export type AgentPreviewMessage = AgentPreviewApplyMessage | AgentPreviewClearMessage;

export type AgentPreviewApplyOk = {
  ok: true;
  applied: Array<{ property: string; value: string; oldValue?: string }>;
};

export type AgentPreviewApplyErr = {
  ok: false;
  code: "stale" | "forbidden_property";
  message: string;
};

export type AgentPreviewClearOk = { ok: true };

type AppliedProperty = {
  property: string;
  previous: string | null;
};

type SelectionOverride = {
  selector: string;
  properties: Map<string, AppliedProperty>;
};

/** selectionId → applied inline overrides (for clear/restore). */
const overrides = new Map<string, SelectionOverride>();

function resolve(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function restoreSelection(selectionId: string): void {
  const bucket = overrides.get(selectionId);
  if (!bucket) {
    return;
  }
  if (typeof document !== "undefined") {
    const el = resolve(bucket.selector);
    if (el instanceof HTMLElement) {
      for (const entry of bucket.properties.values()) {
        if (entry.previous === null || entry.previous.length === 0) {
          el.style.removeProperty(entry.property);
        } else {
          el.style.setProperty(entry.property, entry.previous);
        }
      }
    }
  }
  overrides.delete(selectionId);
}

export function handleAgentPreviewMessage(
  message: AgentPreviewMessage,
): AgentPreviewApplyOk | AgentPreviewApplyErr | AgentPreviewClearOk {
  if (message.type === "agent_preview_clear") {
    if (message.selectionId !== undefined) {
      restoreSelection(message.selectionId);
    } else {
      for (const id of [...overrides.keys()]) {
        restoreSelection(id);
      }
    }
    return { ok: true };
  }

  // Allowlist first so forbidden_property does not require a live DOM (BR-009).
  for (const style of message.styles) {
    if (!isAllowedStyleProperty(style.property)) {
      return {
        ok: false,
        code: "forbidden_property",
        message: `CSS-Property nicht erlaubt: ${style.property}`,
      };
    }
    if (!isSafeCssValue(style.value)) {
      return {
        ok: false,
        code: "forbidden_property",
        message: `Ungültiger CSS-Wert für ${style.property}`,
      };
    }
  }

  if (typeof document === "undefined") {
    return {
      ok: false,
      code: "stale",
      message: "Kein Dokument verfügbar",
    };
  }

  const el = resolve(message.selector);
  if (!el || !(el instanceof HTMLElement)) {
    return {
      ok: false,
      code: "stale",
      message: "Selektor veraltet — Element nicht gefunden (DOM ersetzt?)",
    };
  }

  let bucket = overrides.get(message.selectionId);
  if (!bucket || bucket.selector !== message.selector) {
    if (bucket) {
      restoreSelection(message.selectionId);
    }
    bucket = { selector: message.selector, properties: new Map() };
    overrides.set(message.selectionId, bucket);
  }

  const applied: Array<{ property: string; value: string; oldValue?: string }> = [];

  for (const style of message.styles) {
    const property = style.property;
    const value = style.value.trim();
    const existing = bucket.properties.get(property);
    const previous =
      existing !== undefined
        ? existing.previous
        : el.style.getPropertyValue(property).trim() || null;
    const oldValue =
      existing !== undefined
        ? el.style.getPropertyValue(property).trim() || previous || ""
        : previous ?? el.style.getPropertyValue(property).trim();

    el.style.setProperty(property, value, "important");
    bucket.properties.set(property, { property, previous });

    const entry: { property: string; value: string; oldValue?: string } = {
      property,
      value,
    };
    if (oldValue.length > 0) {
      entry.oldValue = oldValue;
    }
    applied.push(entry);
  }

  return { ok: true, applied };
}

/** Test helper: current override count. */
export function agentPreviewOverrideCount(): number {
  let n = 0;
  for (const bucket of overrides.values()) {
    n += bucket.properties.size;
  }
  return n;
}

/** Test helper: reset module state. */
export function resetAgentPreviewForTests(): void {
  for (const id of [...overrides.keys()]) {
    restoreSelection(id);
  }
  overrides.clear();
}
