/**
 * T-001: limits, dedup, state machine, redaction.
 * Location: packages/core/test/t001-limits-dedup-state-redaction.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_CHIPS_PER_DRAFT,
  PayloadTooLargeError,
  LimitReachedError,
  admitSelection,
  attachSelection,
  createVisualBatch,
  prepareSend,
  admitSend,
  rejectSend,
  clearVisualBatch,
  expireBatch,
  redactText,
  DOM_SNAPSHOT_MAX_BYTES,
  RUNTIME_SUMMARY_MAX_BYTES,
  SELECTION_JSON_MAX_BYTES,
} from "../dist/index.js";

function draftInput(overrides: Partial<Parameters<typeof admitSelection>[0]> = {}) {
  return {
    pageUrl: "http://localhost:3000/",
    tag: "button",
    selector: "#hero > button",
    textSummary: "Angebot berechnen",
    ...overrides,
  };
}

describe("T-001 limits / dedup / state / redaction", () => {
  it("redacts email, sk-, ghp_, and Bearer tokens", () => {
    const raw =
      "contact me@example.com with sk-abc123456789 and ghp_abcdefghijklmnopqrstuv and Bearer eyJhbGciOiJIUzI1NiJ9.aa";
    const redacted = redactText(raw);
    assert.equal(redacted.includes("me@example.com"), false);
    assert.equal(redacted.includes("sk-abc"), false);
    assert.equal(redacted.includes("ghp_abcd"), false);
    assert.match(redacted, /Bearer \[REDACTED_TOKEN\]/);
    assert.match(redacted, /\[REDACTED_EMAIL\]/);
  });

  it("rejects oversized DOM snapshot", () => {
    const huge = "x".repeat(DOM_SNAPSHOT_MAX_BYTES + 1);
    assert.throws(
      () => admitSelection(draftInput({ domSnapshot: huge })),
      (error: unknown) => error instanceof PayloadTooLargeError && error.field === "domSnapshot",
    );
  });

  it("rejects oversized runtime summary", () => {
    const huge = { blob: "y".repeat(RUNTIME_SUMMARY_MAX_BYTES) };
    assert.throws(
      () =>
        admitSelection(
          draftInput({
            source: {
              resolver: "domscribe",
              freshness: "fresh",
              runtimeSummary: huge,
            },
          }),
        ),
      (error: unknown) => error instanceof PayloadTooLargeError && error.field === "runtimeSummary",
    );
  });

  it("rejects selection JSON over 256KiB", () => {
    const selector = "a".repeat(SELECTION_JSON_MAX_BYTES);
    assert.throws(
      () => admitSelection(draftInput({ selector })),
      (error: unknown) => error instanceof PayloadTooLargeError,
    );
  });

  it("dedupes by stable identity tag+selector+textSummary", () => {
    let batch = createVisualBatch("session-a", "agent-1");
    const first = attachSelection(batch, draftInput());
    batch = first.batch;
    assert.equal(first.deduped, false);
    assert.equal(batch.selections.length, 1);

    const second = attachSelection(batch, draftInput({ textSummary: "Angebot berechnen" }));
    assert.equal(second.deduped, true);
    assert.equal(second.batch.selections.length, 1);
    assert.equal(second.selection.id, first.selection.id);
  });

  it("enforces max 10 chips per draft", () => {
    let batch = createVisualBatch("session-a", "agent-1");
    for (let i = 0; i < MAX_CHIPS_PER_DRAFT; i += 1) {
      const result = attachSelection(batch, draftInput({ selector: `#el-${i}`, textSummary: `item ${i}` }));
      batch = result.batch;
    }
    assert.equal(batch.selections.length, MAX_CHIPS_PER_DRAFT);
    assert.throws(
      () => attachSelection(batch, draftInput({ selector: "#el-overflow", textSummary: "overflow" })),
      (error: unknown) => error instanceof LimitReachedError,
    );
  });

  it("supports draft→preparing→sent and rejectSend back to draft with chips", () => {
    let batch = createVisualBatch("session-a", "agent-1");
    batch = attachSelection(batch, draftInput()).batch;
    assert.equal(batch.state, "draft");
    assert.equal(batch.selections.length, 1);

    batch = prepareSend(batch);
    assert.equal(batch.state, "preparing");
    assert.equal(batch.selections.length, 1);
    assert.ok(batch.preparationId);

    batch = rejectSend(batch);
    assert.equal(batch.state, "draft");
    assert.equal(batch.selections.length, 1);
    assert.equal(batch.preparationId, undefined);

    batch = prepareSend(batch);
    assert.ok(batch.preparationId);
    batch = admitSend(batch);
    assert.equal(batch.state, "sent");
    assert.ok(batch.admittedAt);
    assert.equal(batch.preparationId, undefined);
  });

  it("supports cleared and expired transitions", () => {
    let batch = createVisualBatch("session-a", "agent-1");
    batch = attachSelection(batch, draftInput()).batch;
    batch = clearVisualBatch(batch);
    assert.equal(batch.state, "cleared");
    assert.equal(batch.selections.length, 0);

    batch = createVisualBatch("session-b", "agent-1");
    batch = attachSelection(batch, draftInput()).batch;
    batch = expireBatch(batch);
    assert.equal(batch.state, "expired");
  });
});
