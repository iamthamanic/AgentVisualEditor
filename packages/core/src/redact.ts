/**
 * Redaction helpers for page/runtime text before persistence (EDGE-012).
 * Location: packages/core/src/redact.ts
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const SK_RE = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const GHP_RE = /\bghp_[A-Za-z0-9]{20,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const AWS_AKIA_RE = /\bAKIA[0-9A-Z]{16}\b/g;
const SLACK_XOX_RE = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;
const NPM_TOKEN_RE = /\bnpm_[A-Za-z0-9]{20,}\b/g;
const GITHUB_PAT_RE = /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g;

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function redactText(input: string): string {
  return input
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(SK_RE, "[REDACTED_SK]")
    .replace(GHP_RE, "[REDACTED_GHP]")
    .replace(BEARER_RE, "Bearer [REDACTED_TOKEN]")
    .replace(AWS_AKIA_RE, "[REDACTED_AWS_KEY]")
    .replace(SLACK_XOX_RE, "[REDACTED_SLACK_TOKEN]")
    .replace(NPM_TOKEN_RE, "[REDACTED_NPM_TOKEN]")
    .replace(GITHUB_PAT_RE, "[REDACTED_GITHUB_PAT]");
}

export function redactUnknownStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknownStrings(entry));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, nested] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key)) {
        continue;
      }
      out[key] = redactUnknownStrings(nested);
    }
    return out;
  }
  return value;
}
