/**
 * Redaction helpers for page/runtime text before persistence (EDGE-012).
 * Location: packages/core/src/redact.ts
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SK_RE = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const GHP_RE = /\bghp_[A-Za-z0-9]{20,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

export function redactText(input: string): string {
  return input
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(SK_RE, "[REDACTED_SK]")
    .replace(GHP_RE, "[REDACTED_GHP]")
    .replace(BEARER_RE, "Bearer [REDACTED_TOKEN]");
}

export function redactUnknownStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknownStrings(entry));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = redactUnknownStrings(nested);
    }
    return out;
  }
  return value;
}
