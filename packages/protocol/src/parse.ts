/**
 * parseInbound — validate bridge messages against TypeBox schemas.
 * Location: packages/protocol/src/parse.ts
 */

import { Compile } from "typebox/compile";
import type { ErrorEnvelope, InboundBridgeMessage } from "./schemas.js";
import { InboundBridgeMessageSchema } from "./schemas.js";

const inboundValidator = Compile(InboundBridgeMessageSchema);

export type ParseInboundResult =
  | { ok: true; message: InboundBridgeMessage }
  | { ok: false; error: ErrorEnvelope };

function isInboundBridgeMessage(value: unknown): value is InboundBridgeMessage {
  return inboundValidator.Check(value);
}

export function parseInbound(raw: unknown): ParseInboundResult {
  if (!isInboundBridgeMessage(raw)) {
    return {
      ok: false,
      error: {
        ok: false,
        code: "invalid_message",
        message: "Inbound bridge message failed schema validation",
      },
    };
  }
  return { ok: true, message: raw };
}
