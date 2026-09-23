/**
 * Sanitize page URLs before persistence (strip credentials + sensitive query params).
 * Location: packages/core/src/sanitize-url.ts
 */

const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "key",
  "secret",
  "password",
  "access_token",
  "api_key",
  "code",
  "jwt",
  "refresh_token",
  "auth",
  "sid",
  "apikey",
  "session",
  "sessionid",
  "id_token",
  "client_secret",
  "authorization",
]);

/**
 * Strip userinfo credentials and redact sensitive query parameter values.
 * Returns the input unchanged when it is not a parseable absolute URL.
 */
export function sanitizePageUrl(pageUrl: string): string {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return pageUrl;
  }

  url.username = "";
  url.password = "";

  const params = url.searchParams;
  const keys = [...params.keys()];
  for (const key of keys) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      params.set(key, "[REDACTED]");
    }
  }

  return url.toString();
}
