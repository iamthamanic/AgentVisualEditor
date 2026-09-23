/**
 * Bounded element capture for Inspect Mode (FR-004/FR-005).
 * Location: packages/extension/src/content/capture.ts
 *
 * Pure DOM helpers — unit-testable without Chrome APIs.
 */

import type { CapturedElement, CapturedSelection } from "../shared/types.js";

const TEXT_MAX = 512;
const SELECTOR_MAX = 4096;

export function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
}

export function cssEscapeIdent(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * Best-effort stable selector. Prefers id, then data-ds, then path with nth-of-type.
 */
export function buildSelector(el: Element): string {
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
    return truncate(`#${cssEscapeIdent(el.id)}`, SELECTOR_MAX);
  }
  const dataDs = el.getAttribute("data-ds");
  if (dataDs) {
    return truncate(`[data-ds="${cssEscapeIdent(dataDs)}"]`, SELECTOR_MAX);
  }

  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < 12) {
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const siblings = Array.from(parent.children).filter((c) => c.tagName === current?.tagName);
    if (siblings.length === 1) {
      parts.unshift(tag);
    } else {
      const index = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    }
    current = parent;
    depth += 1;
    if (parent.id && /^[a-zA-Z][\w-]*$/.test(parent.id)) {
      parts.unshift(`#${cssEscapeIdent(parent.id)}`);
      break;
    }
  }
  return truncate(parts.join(" > "), SELECTOR_MAX);
}

export function textSummaryOf(el: Element): string | undefined {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return undefined;
  }
  return truncate(text, TEXT_MAX);
}

export function boxOf(el: Element): CapturedElement["box"] | undefined {
  if (!(el instanceof Element)) {
    return undefined;
  }
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function captureElement(el: Element): CapturedElement {
  const root = el.getRootNode();
  const textSummary = textSummaryOf(el);
  const box = boxOf(el);

  if (root instanceof ShadowRoot && root.mode === "closed") {
    const captured: CapturedElement = {
      tag: el.tagName.toLowerCase(),
      selector: truncate(`:host(${el.tagName.toLowerCase()})`, SELECTOR_MAX),
      limitation: "shadow_closed",
    };
    if (textSummary !== undefined) {
      captured.textSummary = textSummary;
    }
    if (box !== undefined) {
      captured.box = box;
    }
    return captured;
  }

  const dataDs = el.getAttribute("data-ds") ?? undefined;
  const captured: CapturedElement = {
    tag: el.tagName.toLowerCase(),
    selector: buildSelector(el),
  };
  if (textSummary !== undefined) {
    captured.textSummary = textSummary;
  }
  if (dataDs !== undefined) {
    captured.dataDs = dataDs;
  }
  if (box !== undefined) {
    captured.box = box;
  }
  return captured;
}

export function captureSelectionFromElement(el: Element, page: {
  url: string;
  title?: string;
}): CapturedSelection {
  const element = captureElement(el);
  const selection: CapturedSelection = {
    page: { url: page.url },
    element,
  };
  if (page.title !== undefined) {
    selection.page.title = page.title;
  }
  return selection;
}

export function isCrossOriginIframe(el: Element): boolean {
  if (!(el instanceof HTMLIFrameElement)) {
    return false;
  }
  try {
    void el.contentDocument;
    return false;
  } catch {
    return true;
  }
}
