/**
 * Extension unit tests: reconnect backoff + URL policy + truncate.
 * Location: packages/extension/test/extension-helpers.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { truncate } from "../dist/content/capture.js";
import { nextBackoffMs, resetBackoff } from "../dist/shared/reconnect.js";
import { assertAllowedGatewayUrl } from "../dist/bridge/client.js";

describe("extension helpers", () => {
  it("truncates long strings", () => {
    assert.equal(truncate("abcdef", 3), "abc");
    assert.equal(truncate("ab", 3), "ab");
  });

  it("backoff increases attempt and stays within max", () => {
    let state = resetBackoff();
    assert.equal(state.attempt, 0);
    const first = nextBackoffMs(state, { baseMs: 100, maxMs: 400 });
    assert.ok(first.delayMs >= 0 && first.delayMs <= 100);
    state = first.next;
    const second = nextBackoffMs(state, { baseMs: 100, maxMs: 400 });
    assert.ok(second.delayMs >= 0 && second.delayMs <= 200);
    state = second.next;
    const third = nextBackoffMs(state, { baseMs: 100, maxMs: 400 });
    assert.ok(third.delayMs >= 0 && third.delayMs <= 400);
  });

  it("allows loopback HTTP and HTTPS; rejects plain LAN HTTP", () => {
    assert.doesNotThrow(() => assertAllowedGatewayUrl("http://127.0.0.1:18789"));
    assert.doesNotThrow(() => assertAllowedGatewayUrl("https://gateway.example"));
    assert.throws(() => assertAllowedGatewayUrl("http://192.168.1.10:18789"));
  });
});
