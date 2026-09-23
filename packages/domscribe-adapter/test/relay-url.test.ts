/**
 * SSRF guard for Domscribe relay URLs.
 * Location: packages/domscribe-adapter/test/relay-url.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHttpRelayLookup, validateDomscribeRelayUrl } from "../dist/index.js";

describe("validateDomscribeRelayUrl", () => {
  it("allows loopback http(s)", () => {
    const a = validateDomscribeRelayUrl("http://127.0.0.1:8787/");
    assert.equal(a.ok, true);
    if (a.ok) {
      assert.equal(a.url, "http://127.0.0.1:8787");
    }
    const b = validateDomscribeRelayUrl("https://localhost:443/relay");
    assert.equal(b.ok, true);
  });

  it("rejects metadata / link-local / non-http", () => {
    assert.equal(validateDomscribeRelayUrl("http://169.254.169.254/latest").ok, false);
    assert.equal(validateDomscribeRelayUrl("http://metadata.google.internal/").ok, false);
    assert.equal(validateDomscribeRelayUrl("http://example.com/").ok, false);
    assert.equal(validateDomscribeRelayUrl("file:///etc/passwd").ok, false);
    assert.equal(validateDomscribeRelayUrl("ftp://127.0.0.1/").ok, false);
  });

  it("createHttpRelayLookup throws on unsafe base URL", () => {
    assert.throws(() => createHttpRelayLookup({ baseUrl: "http://169.254.169.254/" }));
  });
});
