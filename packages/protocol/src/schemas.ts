/**
 * TypeBox schemas for C-006..C-009 bridge messages and ErrorEnvelope.
 * Location: packages/protocol/src/schemas.ts
 */

import { Type } from "typebox";
import { PROTOCOL_VERSION } from "./version.js";

export const ErrorEnvelopeSchema = Type.Object(
  {
    ok: Type.Literal(false),
    code: Type.Union([
      Type.Literal("no_active_session"),
      Type.Literal("no_session_context"),
      Type.Literal("payload_too_large"),
      Type.Literal("forbidden"),
      Type.Literal("not_found"),
      Type.Literal("limit_reached"),
      Type.Literal("stale"),
      Type.Literal("invalid_type"),
      Type.Literal("too_large"),
      Type.Literal("unauthorized"),
      Type.Literal("incompatible_protocol"),
      Type.Literal("invalid_message"),
    ]),
    message: Type.String({ maxLength: 1024 }),
    requestId: Type.Optional(Type.String({ maxLength: 128 })),
    details: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);

export type ErrorEnvelope = {
  ok: false;
  code:
    | "no_active_session"
    | "no_session_context"
    | "payload_too_large"
    | "forbidden"
    | "not_found"
    | "limit_reached"
    | "stale"
    | "invalid_type"
    | "too_large"
    | "unauthorized"
    | "incompatible_protocol"
    | "invalid_message";
  message: string;
  requestId?: string;
  details?: unknown;
};

const BoundingBoxSchema = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number(),
    height: Type.Number(),
  },
  { additionalProperties: false },
);

const SelectionElementSchema = Type.Object(
  {
    tag: Type.String({ minLength: 1, maxLength: 64 }),
    textSummary: Type.Optional(Type.String({ maxLength: 2048 })),
    selector: Type.String({ minLength: 1, maxLength: 8192 }),
    dataDs: Type.Optional(Type.String({ maxLength: 128 })),
    box: Type.Optional(BoundingBoxSchema),
  },
  { additionalProperties: false },
);

const SelectionPageSchema = Type.Object(
  {
    url: Type.String({ minLength: 1, maxLength: 4096 }),
    title: Type.Optional(Type.String({ maxLength: 1024 })),
  },
  { additionalProperties: false },
);

/** C-006 selection.create */
export const SelectionCreateMessageSchema = Type.Object(
  {
    type: Type.Literal("selection.create"),
    protocolVersion: Type.Literal(PROTOCOL_VERSION),
    requestId: Type.String({ minLength: 1, maxLength: 128 }),
    page: SelectionPageSchema,
    element: SelectionElementSchema,
    tabId: Type.Optional(Type.String({ maxLength: 128 })),
    domSnapshot: Type.Optional(Type.String({ maxLength: 102400 })),
  },
  { additionalProperties: false },
);

export type SelectionCreateMessage = {
  type: "selection.create";
  protocolVersion: 1;
  requestId: string;
  page: { url: string; title?: string };
  element: {
    tag: string;
    textSummary?: string;
    selector: string;
    dataDs?: string;
    box?: { x: number; y: number; width: number; height: number };
  };
  tabId?: string;
  domSnapshot?: string;
};

/** C-007 selection.remove */
export const SelectionRemoveMessageSchema = Type.Object(
  {
    type: Type.Literal("selection.remove"),
    protocolVersion: Type.Literal(PROTOCOL_VERSION),
    requestId: Type.String({ minLength: 1, maxLength: 128 }),
    selectionId: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);

export type SelectionRemoveMessage = {
  type: "selection.remove";
  protocolVersion: 1;
  requestId: string;
  selectionId: string;
};

/** C-008 selection.update */
export const SelectionUpdateMessageSchema = Type.Object(
  {
    type: Type.Literal("selection.update"),
    protocolVersion: Type.Literal(PROTOCOL_VERSION),
    requestId: Type.String({ minLength: 1, maxLength: 128 }),
    selectionId: Type.String({ minLength: 1, maxLength: 128 }),
    revision: Type.Optional(Type.Integer({ minimum: 0 })),
    element: Type.Optional(SelectionElementSchema),
    change: Type.Optional(
      Type.Object(
        {
          id: Type.String({ maxLength: 128 }),
          kind: Type.Union([
            Type.Literal("style"),
            Type.Literal("text"),
            Type.Literal("attribute"),
            Type.Literal("other"),
          ]),
          property: Type.Optional(Type.String({ maxLength: 256 })),
          path: Type.Optional(Type.String({ maxLength: 1024 })),
          oldValue: Type.Optional(Type.String({ maxLength: 4096 })),
          newValue: Type.Optional(Type.String({ maxLength: 4096 })),
          status: Type.Union([
            Type.Literal("pending"),
            Type.Literal("in_progress"),
            Type.Literal("resolved"),
            Type.Literal("reverted"),
          ]),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export type SelectionUpdateMessage = {
  type: "selection.update";
  protocolVersion: 1;
  requestId: string;
  selectionId: string;
  revision?: number;
  element?: SelectionCreateMessage["element"];
  change?: {
    id: string;
    kind: "style" | "text" | "attribute" | "other";
    property?: string;
    path?: string;
    oldValue?: string;
    newValue?: string;
    status: "pending" | "in_progress" | "resolved" | "reverted";
  };
};

/** C-009 artifact.upload metadata (PNG body travels separately) */
export const ArtifactUploadMessageSchema = Type.Object(
  {
    type: Type.Literal("artifact.upload"),
    protocolVersion: Type.Literal(PROTOCOL_VERSION),
    requestId: Type.String({ minLength: 1, maxLength: 128 }),
    selectionId: Type.String({ minLength: 1, maxLength: 128 }),
    mime: Type.Literal("image/png"),
    width: Type.Integer({ minimum: 1, maximum: 8192 }),
    height: Type.Integer({ minimum: 1, maximum: 8192 }),
    byteSize: Type.Integer({ minimum: 1, maximum: 2 * 1024 * 1024 }),
    contentHash: Type.Optional(Type.String({ maxLength: 128 })),
  },
  { additionalProperties: false },
);

export type ArtifactUploadMessage = {
  type: "artifact.upload";
  protocolVersion: 1;
  requestId: string;
  selectionId: string;
  mime: "image/png";
  width: number;
  height: number;
  byteSize: number;
  contentHash?: string;
};

export const InboundBridgeMessageSchema = Type.Union([
  SelectionCreateMessageSchema,
  SelectionRemoveMessageSchema,
  SelectionUpdateMessageSchema,
  ArtifactUploadMessageSchema,
]);

export type InboundBridgeMessage =
  | SelectionCreateMessage
  | SelectionRemoveMessage
  | SelectionUpdateMessage
  | ArtifactUploadMessage;
