/**
 * Project VisualBatch to the feature-contract chip DTO.
 * Location: packages/openclaw-plugin/src/project-batch.ts
 */

import { formatChipLabel, type VisualBatch } from "@agent-visual-editor/core";

export type ChipDto = {
  id: string;
  tag: string;
  selector: string;
  textSummary: string | null;
  component: string | null;
  file: string | null;
  line: number | null;
  label: string;
};

export type BatchDto = {
  batchId: string;
  state: string;
  selectionCount: number;
  selections: ChipDto[];
};

export function toBatchDto(batch: VisualBatch): BatchDto {
  // After admitted send the working batch is an empty draft (SCN-021 chips clear).
  // Preparing still shows chips so the user sees retained state on reject.
  if (batch.state === "sent" || batch.state === "cleared" || batch.state === "expired") {
    return {
      batchId: batch.id,
      state: batch.state,
      selectionCount: 0,
      selections: [],
    };
  }
  return {
    batchId: batch.id,
    state: batch.state,
    selectionCount: batch.selections.length,
    selections: batch.selections.map((sel) => ({
      id: sel.id,
      tag: sel.tag,
      selector: sel.selector,
      textSummary: sel.textSummary ?? null,
      component: sel.source?.component ?? null,
      file: sel.source?.file ?? null,
      line: sel.source?.line ?? null,
      label: formatChipLabel(sel),
    })),
  };
}
