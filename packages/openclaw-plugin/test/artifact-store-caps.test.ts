/**
 * Artifact store global/session caps + TTL purge on put.
 * Location: packages/openclaw-plugin/test/artifact-store-caps.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTIFACT_MAX_GLOBAL,
  ARTIFACT_MAX_PER_SESSION,
  ArtifactStore,
} from "../dist/artifact-store.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function putOne(
  store: ArtifactStore,
  opts: { agentId: string; sessionKey: string; selectionId: string; nowMs?: number; ttlMs?: number },
) {
  return store.put({
    selectionId: opts.selectionId,
    agentId: opts.agentId,
    sessionKey: opts.sessionKey,
    width: 1,
    height: 1,
    png: TINY_PNG,
    kind: "viewport",
    pageUrl: "http://localhost/",
    ...(opts.nowMs !== undefined ? { nowMs: opts.nowMs } : {}),
    ...(opts.ttlMs !== undefined ? { ttlMs: opts.ttlMs } : {}),
  });
}

describe("ArtifactStore caps", () => {
  it("enforces max 10 artifacts per session", () => {
    const store = new ArtifactStore();
    for (let i = 0; i < ARTIFACT_MAX_PER_SESSION; i += 1) {
      const result = putOne(store, {
        agentId: "a1",
        sessionKey: "s1",
        selectionId: `sel-${i}`,
      });
      assert.equal(result.ok, true);
    }
    const overflow = putOne(store, {
      agentId: "a1",
      sessionKey: "s1",
      selectionId: "sel-overflow",
    });
    assert.equal(overflow.ok, false);
    if (!overflow.ok) {
      assert.equal(overflow.code, "limit_reached");
    }
  });

  it("enforces max 50 artifacts globally", () => {
    const store = new ArtifactStore();
    let n = 0;
    outer: for (let session = 0; session < 10; session += 1) {
      for (let i = 0; i < ARTIFACT_MAX_PER_SESSION; i += 1) {
        const result = putOne(store, {
          agentId: "a1",
          sessionKey: `s-${session}`,
          selectionId: `sel-${session}-${i}`,
        });
        assert.equal(result.ok, true);
        n += 1;
        if (n >= ARTIFACT_MAX_GLOBAL) {
          break outer;
        }
      }
    }
    assert.equal(store.size(), ARTIFACT_MAX_GLOBAL);
    const overflow = putOne(store, {
      agentId: "a1",
      sessionKey: "s-new",
      selectionId: "sel-global-overflow",
    });
    assert.equal(overflow.ok, false);
    if (!overflow.ok) {
      assert.equal(overflow.code, "limit_reached");
    }
  });

  it("purges expired artifacts on put", () => {
    const store = new ArtifactStore();
    const first = putOne(store, {
      agentId: "a1",
      sessionKey: "s1",
      selectionId: "sel-old",
      nowMs: 1_000,
      ttlMs: 10,
    });
    assert.equal(first.ok, true);
    assert.equal(store.size(), 1);
    const second = putOne(store, {
      agentId: "a1",
      sessionKey: "s1",
      selectionId: "sel-new",
      nowMs: 1_100,
      ttlMs: 60_000,
    });
    assert.equal(second.ok, true);
    assert.equal(store.size(), 1);
  });
});
