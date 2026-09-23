/**
 * T-024 / T-013 / T-012: SourceResolver success, degraded, stale.
 * Location: packages/domscribe-adapter/test/t024-resolve-degraded.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatChipLabel } from "@agent-visual-editor/core";
import {
  createMemoryLookup,
  createSourceResolver,
  DOMSCRIBE_FIXTURE_ENTRIES,
  fixtureLookup,
  statusLabelDe,
} from "../dist/index.js";

describe("T-024 Domscribe fixture exact resolve", () => {
  it("resolves data-ds to file/line/component and chip label", async () => {
    const resolver = createSourceResolver({ lookup: fixtureLookup() });
    const source = await resolver.resolve({
      dataDs: "A81F09",
      pageUrl: "http://localhost:3000/",
    });
    assert.ok(source);
    assert.equal(source.resolver, "domscribe");
    assert.equal(source.freshness, "fresh");
    assert.equal(source.file, "src/features/order/OrderButton.tsx");
    assert.equal(source.line, 42);
    assert.equal(source.column, 5);
    assert.equal(source.component, "OrderButton");
    assert.equal(source.dataDs, "A81F09");
    assert.equal(resolver.statusFor("http://localhost:3000/"), "available");
    assert.equal(statusLabelDe(resolver.lastStatus()), "Quellzuordnung verfügbar");

    const label = formatChipLabel({
      id: "ave_sel_test",
      capturedAt: new Date().toISOString(),
      pageUrl: "http://localhost:3000/",
      tag: "button",
      selector: "#cta",
      changes: [],
      source,
    });
    assert.equal(label, "OrderButton · src/features/order/OrderButton.tsx:42");
  });
});

describe("T-013 degraded when relay/lookup unavailable", () => {
  it("returns unavailable SourceContext and never throws", async () => {
    const resolver = createSourceResolver({
      lookup: createMemoryLookup(DOMSCRIBE_FIXTURE_ENTRIES, { probe: "unavailable" }),
    });
    const source = await resolver.resolve({
      dataDs: "A81F09",
      pageUrl: "http://localhost:3000/prod",
    });
    assert.ok(source);
    assert.equal(source.resolver, "none");
    assert.equal(source.freshness, "unavailable");
    assert.equal(source.dataDs, "A81F09");
    assert.equal(source.file, undefined);
    assert.equal(resolver.statusFor("http://localhost:3000/prod"), "unavailable");
    assert.equal(statusLabelDe("unavailable"), "Quellzuordnung nicht verfügbar");
  });

  it("degrades when no lookup is configured", async () => {
    const resolver = createSourceResolver({});
    const source = await resolver.resolve({ dataDs: "A81F09", pageUrl: "https://example.com/" });
    assert.ok(source);
    assert.equal(source.freshness, "unavailable");
    assert.equal(resolver.statusFor("https://example.com/"), "unavailable");
  });

  it("keeps other pages independent (FR-029)", async () => {
    const resolver = createSourceResolver({ lookup: fixtureLookup() });
    await resolver.resolve({ dataDs: "A81F09", pageUrl: "http://localhost:3000/app" });
    assert.equal(resolver.statusFor("http://localhost:3000/app"), "available");

    // Page without instrumentation: no data-ds → status for that page stays independent.
    await resolver.resolve({ pageUrl: "https://shop.example/" });
    assert.equal(resolver.statusFor("https://shop.example/"), "unavailable");
    assert.equal(resolver.statusFor("http://localhost:3000/app"), "available");
  });
});

describe("T-012 HMR / stale mapping", () => {
  it("marks freshness stale when entry.stale is set", async () => {
    const base = DOMSCRIBE_FIXTURE_ENTRIES.A81F09;
    assert.ok(base);
    const resolver = createSourceResolver({
      lookup: createMemoryLookup({
        A81F09: { ...base, stale: true },
      }),
    });
    const source = await resolver.resolve({ dataDs: "A81F09", pageUrl: "http://localhost:3000/" });
    assert.ok(source);
    assert.equal(source.freshness, "stale");
    assert.equal(source.file, "src/features/order/OrderButton.tsx");
    assert.equal(resolver.lastStatus(), "stale");
    assert.equal(statusLabelDe("stale"), "Quellzuordnung veraltet");
  });

  it("marks stale on fileHash mismatch (advisory)", async () => {
    const resolver = createSourceResolver({ lookup: fixtureLookup() });
    const source = await resolver.resolve({
      dataDs: "A81F09",
      pageUrl: "http://localhost:3000/",
      previousFileHash: "oldhash",
    });
    assert.ok(source);
    assert.equal(source.freshness, "stale");
    assert.equal(source.component, "OrderButton");
  });

  it("returns unmapped for unknown data-ds without failing", async () => {
    const resolver = createSourceResolver({ lookup: fixtureLookup() });
    const source = await resolver.resolve({ dataDs: "UNKNOWN1", pageUrl: "http://localhost:3000/" });
    assert.ok(source);
    assert.equal(source.freshness, "unmapped");
    assert.equal(source.resolver, "domscribe");
  });
});
