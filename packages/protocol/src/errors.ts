/**
 * Error envelope codes for bridge and feature ops.
 * Location: packages/protocol/src/errors.ts
 */

export const ERROR_CODES = [
  "no_active_session",
  "no_session_context",
  "payload_too_large",
  "forbidden",
  "not_found",
  "limit_reached",
  "stale",
  "invalid_type",
  "too_large",
  "unauthorized",
  "incompatible_protocol",
  "invalid_message",
  "invalid_code",
  "expired_code",
  "rate_limited",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
