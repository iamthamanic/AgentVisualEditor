/**
 * parseInbound / parsePairing helpers — validate messages against TypeBox schemas.
 * Location: packages/protocol/src/parse.ts
 */

import { Compile } from "typebox/compile";
import type {
  ActiveSessionChanged,
  BridgeOkResponse,
  ErrorEnvelope,
  InboundBridgeMessage,
  PairingCompleteRequest,
  PairingStartRequest,
  ConnectionRevokeRequest,
} from "./schemas.js";
import {
  ActiveSessionChangedSchema,
  ConnectionRevokeRequestSchema,
  InboundBridgeMessageSchema,
  PairingCompleteRequestSchema,
  PairingStartRequestSchema,
} from "./schemas.js";

const inboundValidator = Compile(InboundBridgeMessageSchema);
const pairingCompleteValidator = Compile(PairingCompleteRequestSchema);
const pairingStartValidator = Compile(PairingStartRequestSchema);
const revokeValidator = Compile(ConnectionRevokeRequestSchema);
const activeSessionValidator = Compile(ActiveSessionChangedSchema);

export type ParseInboundResult =
  | { ok: true; message: InboundBridgeMessage }
  | { ok: false; error: ErrorEnvelope };

export type ParsePairingCompleteResult =
  | { ok: true; message: PairingCompleteRequest }
  | { ok: false; error: ErrorEnvelope };

export type ParsePairingStartResult =
  | { ok: true; message: PairingStartRequest }
  | { ok: false; error: ErrorEnvelope };

export type ParseRevokeResult =
  | { ok: true; message: ConnectionRevokeRequest }
  | { ok: false; error: ErrorEnvelope };

function invalid(message: string, requestId?: string): ErrorEnvelope {
  const error: ErrorEnvelope = {
    ok: false,
    code: "invalid_message",
    message,
  };
  if (requestId !== undefined) {
    error.requestId = requestId;
  }
  return error;
}

export function parseInbound(raw: unknown): ParseInboundResult {
  if (!inboundValidator.Check(raw)) {
    return { ok: false, error: invalid("Inbound bridge message failed schema validation") };
  }
  return { ok: true, message: raw };
}

export function parsePairingComplete(raw: unknown): ParsePairingCompleteResult {
  if (!pairingCompleteValidator.Check(raw)) {
    return { ok: false, error: invalid("pairing.complete failed schema validation") };
  }
  return { ok: true, message: raw };
}

export function parsePairingStart(raw: unknown): ParsePairingStartResult {
  if (!pairingStartValidator.Check(raw)) {
    return { ok: false, error: invalid("pairing.start failed schema validation") };
  }
  return { ok: true, message: raw };
}

export function parseConnectionRevoke(raw: unknown): ParseRevokeResult {
  if (!revokeValidator.Check(raw)) {
    return { ok: false, error: invalid("connection.revoke failed schema validation") };
  }
  return { ok: true, message: raw };
}

export function isActiveSessionChanged(raw: unknown): raw is ActiveSessionChanged {
  return activeSessionValidator.Check(raw);
}

export function isBridgeOkResponse(raw: unknown): raw is BridgeOkResponse {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  return "ok" in raw && Reflect.get(raw, "ok") === true;
}
