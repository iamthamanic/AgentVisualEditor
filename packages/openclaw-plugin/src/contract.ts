/**
 * Feature contract for SLC-1..SLC-3 ops and agent tools.
 * Location: packages/openclaw-plugin/src/contract.ts
 *
 * OpenClaw requires operation ids matching /^[a-z][a-z0-9._-]{0,127}$/
 * Agent tools via operation.tool → registerTool (C-012..C-014).
 */

import { Type } from "typebox";
import { defineFeatureContract } from "openclaw/plugin-sdk/feature-contract";

const SessionIdentityFields = {
  sessionKey: Type.String({ minLength: 1, maxLength: 512 }),
  agentId: Type.String({ minLength: 1, maxLength: 256 }),
};

const ChipProjectionSchema = Type.Object(
  {
    id: Type.String(),
    tag: Type.String(),
    selector: Type.String(),
    textSummary: Type.Union([Type.String(), Type.Null()]),
    component: Type.Union([Type.String(), Type.Null()]),
    file: Type.Union([Type.String(), Type.Null()]),
    line: Type.Union([Type.Integer(), Type.Null()]),
    label: Type.String(),
  },
  { additionalProperties: false },
);

const BatchProjectionSchema = Type.Object(
  {
    batchId: Type.String(),
    state: Type.String(),
    selectionCount: Type.Integer({ minimum: 0 }),
    selections: Type.Array(ChipProjectionSchema),
  },
  { additionalProperties: false },
);

const OpErrorSchema = Type.Object(
  {
    ok: Type.Literal(false),
    code: Type.Union([
      Type.Literal("no_session_context"),
      Type.Literal("forbidden"),
      Type.Literal("not_found"),
      Type.Literal("limit_reached"),
      Type.Literal("payload_too_large"),
      Type.Literal("invalid_batch_state"),
      Type.Literal("rate_limited"),
      Type.Literal("invalid_code"),
      Type.Literal("expired_code"),
      Type.Literal("incompatible_protocol"),
      Type.Literal("no_active_session"),
      Type.Literal("stale_batch"),
      Type.Literal("stale_preparation"),
      Type.Literal("unavailable_context"),
      Type.Literal("no_context"),
      Type.Literal("expired"),
    ]),
    message: Type.String(),
  },
  { additionalProperties: false },
);

const ConnectionRowSchema = Type.Object(
  {
    connectionId: Type.String(),
    extensionInstanceId: Type.String(),
    extensionLabel: Type.Union([Type.String(), Type.Null()]),
    createdAtMs: Type.Integer({ minimum: 0 }),
    revoked: Type.Boolean(),
  },
  { additionalProperties: false },
);

const ActiveContextSchema = Type.Object(
  {
    batchId: Type.String(),
    state: Type.String(),
    sessionKey: Type.String(),
    agentId: Type.String(),
    selectionCount: Type.Integer({ minimum: 0 }),
    selections: Type.Array(
      Type.Object(
        {
          id: Type.String(),
          tag: Type.String(),
          selector: Type.String(),
          textSummary: Type.Union([Type.String(), Type.Null()]),
          component: Type.Union([Type.String(), Type.Null()]),
          file: Type.Union([Type.String(), Type.Null()]),
          line: Type.Union([Type.Integer(), Type.Null()]),
          sourceFreshness: Type.Union([Type.String(), Type.Null()]),
        },
        { additionalProperties: false },
      ),
    ),
    truncated: Type.Boolean(),
  },
  { additionalProperties: false },
);

const SelectionDetailSchema = Type.Object(
  {
    id: Type.String(),
    batchId: Type.String(),
    capturedAt: Type.String(),
    pageUrl: Type.String(),
    pageTitle: Type.Union([Type.String(), Type.Null()]),
    tag: Type.String(),
    selector: Type.String(),
    textSummary: Type.Union([Type.String(), Type.Null()]),
    box: Type.Union([
      Type.Object(
        {
          x: Type.Number(),
          y: Type.Number(),
          width: Type.Number(),
          height: Type.Number(),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    domSnapshot: Type.Union([Type.String(), Type.Null()]),
    domTruncated: Type.Boolean(),
    source: Type.Union([
      Type.Object(
        {
          resolver: Type.String(),
          freshness: Type.String(),
          component: Type.Union([Type.String(), Type.Null()]),
          file: Type.Union([Type.String(), Type.Null()]),
          line: Type.Union([Type.Integer(), Type.Null()]),
          column: Type.Union([Type.Integer(), Type.Null()]),
          dataDs: Type.Union([Type.String(), Type.Null()]),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    changes: Type.Array(
      Type.Object(
        {
          id: Type.String(),
          kind: Type.String(),
          property: Type.Union([Type.String(), Type.Null()]),
          status: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const contract = defineFeatureContract({
  pluginId: "agent-visual-editor",
  operations: {
    get_visual_batch: {
      kind: "query",
      description: "Read the visual batch for the bound OpenClaw session (getVisualBatch).",
      input: Type.Object({ ...SessionIdentityFields }, { additionalProperties: false }),
      output: Type.Union([
        Type.Object({ ok: Type.Literal(true), batch: BatchProjectionSchema }, { additionalProperties: false }),
        OpErrorSchema,
      ]),
    },
    attach_test_selection: {
      kind: "action",
      description: "Attach a config-gated debug test selection chip (attachTestSelection; never sends).",
      input: Type.Object(
        {
          ...SessionIdentityFields,
          tag: Type.Optional(Type.String({ maxLength: 64 })),
          textSummary: Type.Optional(Type.String({ maxLength: 2048 })),
          selector: Type.Optional(Type.String({ maxLength: 8192 })),
          component: Type.Optional(Type.String({ maxLength: 256 })),
          file: Type.Optional(Type.String({ maxLength: 1024 })),
          line: Type.Optional(Type.Integer({ minimum: 1 })),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object(
          {
            ok: Type.Literal(true),
            batch: BatchProjectionSchema,
            selectionId: Type.String(),
            deduped: Type.Boolean(),
          },
          { additionalProperties: false },
        ),
        OpErrorSchema,
      ]),
    },
    remove_selection: {
      kind: "action",
      description: "Remove one selection chip from the draft batch (removeSelection; never sends).",
      input: Type.Object(
        {
          ...SessionIdentityFields,
          selectionId: Type.String({ minLength: 1, maxLength: 128 }),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object({ ok: Type.Literal(true), batch: BatchProjectionSchema }, { additionalProperties: false }),
        OpErrorSchema,
      ]),
    },
    clear_visual_batch: {
      kind: "action",
      description: "Clear all chips for the session draft (clearVisualBatch; never sends).",
      input: Type.Object({ ...SessionIdentityFields }, { additionalProperties: false }),
      output: Type.Union([
        Type.Object({ ok: Type.Literal(true), batch: BatchProjectionSchema }, { additionalProperties: false }),
        OpErrorSchema,
      ]),
    },
    prepare_send: {
      kind: "action",
      description:
        "Prepare the current VisualBatch for an explicit user Send (C-010). Does not start an agent run.",
      input: Type.Object(
        {
          ...SessionIdentityFields,
          expectedRevision: Type.Optional(Type.Integer({ minimum: 0 })),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object(
          {
            ok: Type.Literal(true),
            preparationId: Type.String(),
            revision: Type.Integer({ minimum: 0 }),
            batch: BatchProjectionSchema,
            compactContext: Type.String(),
          },
          { additionalProperties: false },
        ),
        OpErrorSchema,
      ]),
    },
    send_outcome: {
      kind: "action",
      description:
        "Admit or reject a Send preparation (C-011). On admit, clears chips and queues next-turn context.",
      input: Type.Object(
        {
          ...SessionIdentityFields,
          preparationId: Type.String({ minLength: 1, maxLength: 128 }),
          admitted: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object(
          {
            ok: Type.Literal(true),
            state: Type.String(),
            admitted: Type.Boolean(),
            batch: BatchProjectionSchema,
            injectionEnqueued: Type.Boolean(),
          },
          { additionalProperties: false },
        ),
        OpErrorSchema,
      ]),
    },
    get_active_context: {
      kind: "query",
      description:
        "Return the active/sent visual context for the caller's session (C-012). Read-only.",
      tool: {
        name: "agent_visual_editor.get_active_context",
        label: "AVE Active Context",
      },
      input: Type.Object(
        {
          batchId: Type.Optional(Type.String({ maxLength: 128 })),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object(
          {
            ok: Type.Literal(true),
            context: ActiveContextSchema,
          },
          { additionalProperties: false },
        ),
        OpErrorSchema,
      ]),
    },
    get_selection: {
      kind: "query",
      description:
        "Return one selection with source/change metadata for the caller's session (C-013). Read-only.",
      tool: {
        name: "agent_visual_editor.get_selection",
        label: "AVE Selection",
      },
      input: Type.Object(
        {
          selectionId: Type.String({ minLength: 1, maxLength: 128 }),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object(
          {
            ok: Type.Literal(true),
            selection: SelectionDetailSchema,
          },
          { additionalProperties: false },
        ),
        OpErrorSchema,
      ]),
    },
    get_screenshot: {
      kind: "query",
      description:
        "Return a screenshot artifact for a selection when available (C-014). Read-only stub until SLC-5.",
      tool: {
        name: "agent_visual_editor.get_screenshot",
        label: "AVE Screenshot",
        optional: true,
      },
      input: Type.Object(
        {
          selectionId: Type.Optional(Type.String({ maxLength: 128 })),
          artifactId: Type.Optional(Type.String({ maxLength: 128 })),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object(
          {
            ok: Type.Literal(true),
            artifactId: Type.String(),
            mimeType: Type.String(),
            expired: Type.Literal(false),
          },
          { additionalProperties: false },
        ),
        OpErrorSchema,
      ]),
    },
    get_ui_flags: {
      kind: "query",
      description: "Read plugin UI feature flags for the Control UI.",
      input: Type.Object({}, { additionalProperties: false }),
      output: Type.Object(
        {
          composerUiEnabled: Type.Boolean(),
          testSelectionEnabled: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
    },
    pairing_start: {
      kind: "action",
      description: "Generate a one-time extension pairing code (C-001).",
      input: Type.Object(
        {
          label: Type.Optional(Type.String({ maxLength: 128 })),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object(
          {
            ok: Type.Literal(true),
            code: Type.String(),
            expiresAt: Type.String(),
            attemptId: Type.String(),
          },
          { additionalProperties: false },
        ),
        OpErrorSchema,
      ]),
    },
    connection_revoke: {
      kind: "action",
      description: "Revoke a paired extension connection and terminate its bridge (C-003).",
      input: Type.Object(
        {
          connectionId: Type.String({ minLength: 1, maxLength: 128 }),
        },
        { additionalProperties: false },
      ),
      output: Type.Union([
        Type.Object(
          {
            ok: Type.Literal(true),
            revoked: Type.Literal(true),
            connectionId: Type.String(),
          },
          { additionalProperties: false },
        ),
        OpErrorSchema,
      ]),
    },
    list_connections: {
      kind: "query",
      description: "List paired extension connections for the health page.",
      input: Type.Object({}, { additionalProperties: false }),
      output: Type.Object(
        {
          ok: Type.Literal(true),
          connections: Type.Array(ConnectionRowSchema),
        },
        { additionalProperties: false },
      ),
    },
    report_active_session: {
      kind: "action",
      description: "Report the exact active OpenClaw chat for extension targeting (C-005).",
      input: Type.Object(
        {
          sessionKey: Type.Optional(Type.Union([Type.String({ maxLength: 512 }), Type.Null()])),
          agentId: Type.Optional(Type.Union([Type.String({ maxLength: 256 }), Type.Null()])),
          title: Type.Optional(Type.Union([Type.String({ maxLength: 512 }), Type.Null()])),
          ambiguous: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      output: Type.Object(
        {
          ok: Type.Literal(true),
          revision: Type.Integer({ minimum: 0 }),
          status: Type.Union([
            Type.Literal("active"),
            Type.Literal("none"),
            Type.Literal("ambiguous"),
          ]),
          sessionKey: Type.Union([Type.String(), Type.Null()]),
          agentId: Type.Union([Type.String(), Type.Null()]),
          title: Type.Union([Type.String(), Type.Null()]),
        },
        { additionalProperties: false },
      ),
    },
    get_health: {
      kind: "query",
      description: "Setup/health snapshot for AVE Status page (FR-028).",
      input: Type.Object({}, { additionalProperties: false }),
      output: Type.Object(
        {
          ok: Type.Literal(true),
          pluginInstalled: Type.Literal(true),
          bridgePath: Type.String(),
          pairedConnectionCount: Type.Integer({ minimum: 0 }),
          activeSessionAvailable: Type.Boolean(),
          activeSessionStatus: Type.Union([
            Type.Literal("active"),
            Type.Literal("none"),
            Type.Literal("ambiguous"),
          ]),
          domscribeStatus: Type.Literal("unavailable"),
          protocolVersion: Type.Integer(),
        },
        { additionalProperties: false },
      ),
    },
  },
  events: {
    visual_batch_changed: Type.Object(
      {
        sessionKey: Type.String(),
        agentId: Type.String(),
        batch: BatchProjectionSchema,
      },
      { additionalProperties: false },
    ),
  },
});
