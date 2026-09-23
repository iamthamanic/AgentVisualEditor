/**
 * SSRF-safe allowlist for Domscribe relay base URLs.
 * Location: packages/domscribe-adapter/src/relay-url.ts
 *
 * Only http(s) to loopback (127.0.0.1 / localhost / ::1). Rejects link-local
 * metadata endpoints and non-http(s) schemes.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const BLOCKED_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.google",
  "metadata",
]);

export type RelayUrlValidation =
  | { ok: true; url: string }
  | { ok: false; message: string };

function isLinkLocalIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  return a === 169 && b === 254;
}

/**
 * Validate a Domscribe relay base URL. Returns a trimmed URL without trailing slash.
 */
export function validateDomscribeRelayUrl(raw: string): RelayUrlValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "Relay-URL fehlt" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "Ungültige Relay-URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Relay-URL darf nur http(s) verwenden" };
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isLinkLocalIpv4(host)) {
    return { ok: false, message: "Relay-URL Ziel ist nicht erlaubt" };
  }

  if (!LOOPBACK_HOSTS.has(host)) {
    return {
      ok: false,
      message: "Relay-URL darf nur auf 127.0.0.1/localhost zeigen",
    };
  }

  // Disallow credentials in relay URL.
  if (url.username || url.password) {
    return { ok: false, message: "Relay-URL darf keine Credentials enthalten" };
  }

  const normalized = `${url.protocol}//${url.host}${url.pathname}`.replace(/\/$/, "");
  return { ok: true, url: normalized.length > 0 ? normalized : `${url.protocol}//${url.host}` };
}
