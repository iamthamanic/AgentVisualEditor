/**
 * Bounded, redacted tool payloads for C-012..C-014.
 * Location: packages/openclaw-plugin/src/tool-payloads.ts
 */

import {
  DOM_SNAPSHOT_MAX_BYTES,
  redactText,
  utf8ByteLength,
  type VisualBatch,
  type VisualSelection,
} from "@agent-visual-editor/core";

export type ActiveContextDto = {
  batchId: string;
  state: string;
  sessionKey: string;
  agentId: string;
  selectionCount: number;
  selections: Array<{
    id: string;
    tag: string;
    selector: string;
    textSummary: string | null;
    component: string | null;
    file: string | null;
    line: number | null;
    sourceFreshness: string | null;
  }>;
  truncated: boolean;
};

export type SelectionDetailDto = {
  id: string;
  batchId: string;
  capturedAt: string;
  pageUrl: string;
  pageTitle: string | null;
  tag: string;
  selector: string;
  textSummary: string | null;
  box: { x: number; y: number; width: number; height: number } | null;
  domSnapshot: string | null;
  domTruncated: boolean;
  source: {
    resolver: string;
    freshness: string;
    component: string | null;
    file: string | null;
    line: number | null;
    column: number | null;
    dataDs: string | null;
  } | null;
  changes: Array<{
    id: string;
    kind: string;
    property: string | null;
    oldValue: string | null;
    newValue: string | null;
    status: string;
  }>;
};

function clipText(value: string | undefined, maxChars: number): string | null {
  if (value === undefined) {
    return null;
  }
  const redacted = redactText(value);
  if (redacted.length <= maxChars) {
    return redacted;
  }
  return `${redacted.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function toActiveContextDto(batch: VisualBatch): ActiveContextDto {
  return {
    batchId: batch.id,
    state: batch.state,
    sessionKey: batch.sessionKey,
    agentId: batch.agentId,
    selectionCount: batch.selections.length,
    selections: batch.selections.map((sel) => ({
      id: sel.id,
      tag: sel.tag,
      selector: clipText(sel.selector, 512) ?? "",
      textSummary: clipText(sel.textSummary, 256),
      component: sel.source?.component ? redactText(sel.source.component) : null,
      file: sel.source?.file ? redactText(sel.source.file) : null,
      line: sel.source?.line ?? null,
      sourceFreshness: sel.source?.freshness ?? null,
    })),
    truncated: false,
  };
}

export function toSelectionDetailDto(
  batch: VisualBatch,
  selection: VisualSelection,
): SelectionDetailDto {
  let domSnapshot: string | null = null;
  let domTruncated = false;
  if (selection.domSnapshot !== undefined) {
    const redacted = redactText(selection.domSnapshot);
    if (utf8ByteLength(redacted) > DOM_SNAPSHOT_MAX_BYTES) {
      domTruncated = true;
      let end = Math.min(redacted.length, DOM_SNAPSHOT_MAX_BYTES);
      while (end > 0 && utf8ByteLength(redacted.slice(0, end)) > DOM_SNAPSHOT_MAX_BYTES) {
        end -= 1;
      }
      domSnapshot = `${redacted.slice(0, Math.max(0, end - 1))}…`;
    } else {
      domSnapshot = redacted;
    }
  }

  return {
    id: selection.id,
    batchId: batch.id,
    capturedAt: selection.capturedAt,
    pageUrl: redactText(selection.pageUrl),
    pageTitle: selection.pageTitle ? redactText(selection.pageTitle) : null,
    tag: selection.tag,
    selector: clipText(selection.selector, 8192) ?? "",
    textSummary: clipText(selection.textSummary, 2048),
    box: selection.box
      ? {
          x: selection.box.x,
          y: selection.box.y,
          width: selection.box.width,
          height: selection.box.height,
        }
      : null,
    domSnapshot,
    domTruncated,
    source: selection.source
      ? {
          resolver: selection.source.resolver,
          freshness: selection.source.freshness,
          component: selection.source.component
            ? redactText(selection.source.component)
            : null,
          file: selection.source.file ? redactText(selection.source.file) : null,
          line: selection.source.line ?? null,
          column: selection.source.column ?? null,
          dataDs: selection.source.dataDs ?? null,
        }
      : null,
    changes: selection.changes.map((change) => ({
      id: change.id,
      kind: change.kind,
      property: change.property ?? null,
      oldValue: change.oldValue ?? null,
      newValue: change.newValue ?? null,
      status: change.status,
    })),
  };
}
