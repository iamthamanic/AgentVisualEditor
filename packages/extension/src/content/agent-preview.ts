/**
 * Agent preview stylesheet executor (C-015 / RISK-009).
 * Location: packages/extension/src/content/agent-preview.ts
 *
 * Applies allowlisted CSS via a dedicated stylesheet (not page CSS / Design-tab inline).
 * Never evaluates JS (BR-009). Clear disables overrides for HMR verification.
 */

import { isAllowedStyleProperty, isSafeCssValue } from "../editor/allowed-styles.js";

const STYLE_ELEMENT_ID = "ave-agent-preview";

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

/** selectionId → property → value (plus __selector__). */
const overrides = new Map<string, Map<string, string>>();

function ensureStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }
  const el = document.createElement("style");
  el.id = STYLE_ELEMENT_ID;
  el.setAttribute("data-ave", "agent-preview");
  document.documentElement.appendChild(el);
  return el;
}

function rebuildStylesheet(): void {
  const sheet = ensureStyleElement();
  const blocks: string[] = [];
  for (const [, props] of overrides) {
    const selector = props.get("__selector__");
    if (!selector) continue;
    const decls: string[] = [];
    for (const [property, value] of props) {
      if (property === "__selector__") continue;
      decls.push(`${property}: ${value} !important`);
    }
    if (decls.length === 0) continue;
    blocks.push(`${selector} { ${decls.join("; ")}; }`);
  }
  sheet.textContent = blocks.join("\n");
}

function resolve(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export function handleAgentPreviewMessage(
  message: AgentPreviewMessage,
): AgentPreviewApplyOk | AgentPreviewApplyErr | AgentPreviewClearOk {
  if (message.type === "agent_preview_clear") {
    if (message.selectionId !== undefined) {
      overrides.delete(message.selectionId);
    } else {
      overrides.clear();
    }
    if (typeof document !== "undefined") {
      rebuildStylesheet();
      if (overrides.size === 0) {
        document.getElementById(STYLE_ELEMENT_ID)?.remove();
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

  const applied: Array<{ property: string; value: string; oldValue?: string }> = [];
  let bucket = overrides.get(message.selectionId);
  if (!bucket) {
    bucket = new Map();
    overrides.set(message.selectionId, bucket);
  }
  bucket.set("__selector__", message.selector);

  for (const style of message.styles) {
    const computed = getComputedStyle(el).getPropertyValue(style.property).trim();
    const oldValue = bucket.get(style.property) ?? computed;
    bucket.set(style.property, style.value.trim());
    const entry: { property: string; value: string; oldValue?: string } = {
      property: style.property,
      value: style.value.trim(),
    };
    if (oldValue.length > 0) {
      entry.oldValue = oldValue;
    }
    applied.push(entry);
  }

  rebuildStylesheet();
  return { ok: true, applied };
}

/** Test helper: current override count. */
export function agentPreviewOverrideCount(): number {
  let n = 0;
  for (const [, props] of overrides) {
    for (const key of props.keys()) {
      if (key !== "__selector__") n += 1;
    }
  }
  return n;
}

/** Test helper: reset module state. */
export function resetAgentPreviewForTests(): void {
  overrides.clear();
  if (typeof document !== "undefined") {
    document.getElementById(STYLE_ELEMENT_ID)?.remove();
  }
}
