# SLC-4 design — Domscribe adapter

## Goal

Resolve selected elements with `data-ds` to exact SourceContext (file/line/column/component + optional runtime) when Domscribe is present (FR-011). When absent/unavailable/unmapped/stale, continue in degraded selector mode with a visible German status — never fail the product (FR-012, FR-029, BR-007).

## Architecture

```text
Extension capture (data-ds)
        │
        ▼
Bridge selection.create / .update
        │
        ▼
SourceResolver (packages/domscribe-adapter)
        ├── DomscribeLookup (injected)
        │     ├── MemoryLookup (fixture / tests)
        │     └── HttpRelayLookup (GET /api/manifest/:id, /api/health)
        └── PageStatusStore (per pageUrl / projectKey)
        │
        ▼
VisualSelection.source → chip label Component · file:line
```

## Boundaries (INV-5 / INV-6)

- `domscribe-adapter` depends only on `@agent-visual-editor/core` (no OpenClaw SDK, no Chrome APIs).
- No Domscribe instrumentation code copied into the extension.
- `core` / `protocol` remain OpenClaw-free.

## Resolve semantics (C-017)

| Input / lookup result | SourceContext |
|----------------------|---------------|
| no `dataDs` | omitted (selector-only chip); page status unchanged or probe-only |
| lookup missing / relay dead / timeout | `resolver: "none"`, `freshness: "unavailable"`, keep `dataDs` |
| id not in manifest | `resolver: "domscribe"`, `freshness: "unmapped"` |
| entry with `stale` or fileHash mismatch vs previous | `resolver: "domscribe"`, `freshness: "stale"` (advisory) |
| exact hit | `resolver: "domscribe"`, `freshness: "fresh"`, file/line/column/component |

Resolve never throws into the selection path.

## Status (FR-029)

- Status is keyed by page URL (origin+path) / optional projectKey — not a global connection failure.
- German labels: `Quellzuordnung nicht verfügbar` / `… verfügbar` / `… veraltet` / `… Fehler`.
- `get_health.domscribeStatus` reflects last inspected page (or `unavailable` if none).
- Selection ack may include optional `sourceFreshness` for extension side-panel wiring.

## Config

- `domscribeEnabled` (default true = auto): when false, always degraded.
- `domscribeRelayUrl` (optional): HTTP relay base; absent → degraded until a lookup is injected (tests/fixture).

## Tests

- T-024: fixture map → exact file/line/component; chip label `Component · file:line`
- T-013: dead/missing lookup → degraded + unavailable label; selection still attaches
- T-012: stale flag / fileHash mismatch → `freshness: "stale"`; selection remains usable

## Non-goals

- Embedding Domscribe transform/compiler
- Prod SaaS distribution
- Generic MCP adapter (SLC-7)
- Changing chip attach UX beyond source label/status

## Ready for /implement

YES
