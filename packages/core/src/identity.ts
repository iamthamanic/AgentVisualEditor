/**
 * Stable identity and chip label helpers for VisualSelection.
 * Location: packages/core/src/identity.ts
 */

import type { ChipLabelParts, StableIdentity, VisualSelection } from "./types.js";

export function stableIdentityOf(selection: Pick<VisualSelection, "tag" | "selector" | "textSummary">): StableIdentity {
  return {
    tag: selection.tag.trim().toLowerCase(),
    selector: selection.selector.trim(),
    textSummary: (selection.textSummary ?? "").trim(),
  };
}

export function sameStableIdentity(a: StableIdentity, b: StableIdentity): boolean {
  return a.tag === b.tag && a.selector === b.selector && a.textSummary === b.textSummary;
}

/**
 * Label priority: Component · file:line → tag · text → Element · selector
 */
export function chipLabel(selection: VisualSelection): ChipLabelParts {
  const component = selection.source?.component?.trim();
  const file = selection.source?.file?.trim();
  const line = selection.source?.line;
  if (component && file && typeof line === "number") {
    return {
      primary: component,
      secondary: `${file}:${line}`,
    };
  }

  const text = selection.textSummary?.trim();
  if (text) {
    const clipped = text.length > 48 ? `${text.slice(0, 45)}…` : text;
    return {
      primary: selection.tag,
      secondary: clipped,
    };
  }

  const selector = selection.selector.trim() || "(unbekannt)";
  const clippedSelector = selector.length > 64 ? `${selector.slice(0, 61)}…` : selector;
  return {
    primary: "Element",
    secondary: clippedSelector,
  };
}

export function formatChipLabel(selection: VisualSelection): string {
  const parts = chipLabel(selection);
  return parts.secondary ? `${parts.primary} · ${parts.secondary}` : parts.primary;
}
