/**
 * Selection admission with size caps, redaction, and identity helpers.
 * Location: packages/core/src/selection.ts
 */

import {
  DOM_SNAPSHOT_MAX_BYTES,
  RUNTIME_SUMMARY_MAX_BYTES,
  SELECTION_JSON_MAX_BYTES,
  SELECTOR_MAX_BYTES,
  TEXT_SUMMARY_MAX_BYTES,
  measureJsonBytes,
  utf8ByteLength,
} from "./limits.js";
import { PayloadTooLargeError } from "./errors.js";
import { redactText, redactUnknownStrings } from "./redact.js";
import { sanitizePageUrl } from "./sanitize-url.js";
import type { SelectionDraftInput, SourceContext, VisualSelection } from "./types.js";

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) {
    return value;
  }
  let end = Math.min(value.length, maxBytes);
  while (end > 0 && utf8ByteLength(value.slice(0, end)) > maxBytes) {
    end -= 1;
  }
  return value.slice(0, end);
}

function assertFieldSize(field: string, value: string | undefined, maxBytes: number): void {
  if (value === undefined) {
    return;
  }
  const actual = utf8ByteLength(value);
  if (actual > maxBytes) {
    throw new PayloadTooLargeError(field, maxBytes, actual);
  }
}

function normalizeSource(input: SelectionDraftInput["source"]): SourceContext | undefined {
  if (!input) {
    return undefined;
  }
  let runtimeSummary = input.runtimeSummary === undefined
    ? undefined
    : redactUnknownStrings(input.runtimeSummary);
  if (runtimeSummary !== undefined) {
    const bytes = measureJsonBytes(runtimeSummary);
    if (bytes > RUNTIME_SUMMARY_MAX_BYTES) {
      throw new PayloadTooLargeError("runtimeSummary", RUNTIME_SUMMARY_MAX_BYTES, bytes);
    }
  }
  const source: SourceContext = {
    resolver: input.resolver,
    freshness: input.freshness,
  };
  if (input.dataDs !== undefined) {
    source.dataDs = input.dataDs;
  }
  if (input.file !== undefined) {
    source.file = input.file;
  }
  if (input.line !== undefined) {
    source.line = input.line;
  }
  if (input.column !== undefined) {
    source.column = input.column;
  }
  if (input.component !== undefined) {
    source.component = input.component;
  }
  if (runtimeSummary !== undefined) {
    source.runtimeSummary = runtimeSummary;
  }
  return source;
}

export function createSelectionId(): string {
  return `ave_sel_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Build a bounded, redacted VisualSelection. Throws PayloadTooLargeError on hard caps.
 */
export function admitSelection(input: SelectionDraftInput, id = createSelectionId()): VisualSelection {
  assertFieldSize("selector", input.selector, SELECTOR_MAX_BYTES);
  assertFieldSize("domSnapshot", input.domSnapshot, DOM_SNAPSHOT_MAX_BYTES);

  const textSummary = input.textSummary === undefined
    ? undefined
    : truncateUtf8(redactText(input.textSummary), TEXT_SUMMARY_MAX_BYTES);

  const selection: VisualSelection = {
    id,
    capturedAt: new Date().toISOString(),
    pageUrl: sanitizePageUrl(input.pageUrl),
    tag: input.tag,
    selector: input.selector,
    changes: input.changes ? [...input.changes] : [],
  };

  if (input.pageTitle !== undefined) {
    selection.pageTitle = redactText(input.pageTitle);
  }
  if (input.tabId !== undefined) {
    selection.tabId = input.tabId;
  }
  if (textSummary !== undefined) {
    selection.textSummary = textSummary;
  }
  if (input.box !== undefined) {
    selection.box = { ...input.box };
  }
  if (input.domSnapshot !== undefined) {
    selection.domSnapshot = redactText(input.domSnapshot);
  }
  const source = normalizeSource(input.source);
  if (source !== undefined) {
    selection.source = source;
  }

  const bytes = measureJsonBytes(selection);
  if (bytes > SELECTION_JSON_MAX_BYTES) {
    throw new PayloadTooLargeError("selection", SELECTION_JSON_MAX_BYTES, bytes);
  }

  return selection;
}
