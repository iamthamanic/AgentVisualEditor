# SLC-7 design — Adapter boundary + docs + release readiness

## Goal

Harden INV-5 / FR-031 / SCN-024 with a CI-capable static architecture check so `core`/`protocol` stay agent-agnostic (no OpenClaw SDK, no Chrome APIs). Prove the extension never imports OpenClaw SDK. Keep `mcp-adapter` as a ready placeholder. Ship docs (setup/health/pairing/flags/rollback + runbooks), MIT notices (T-028), and release-acceptance evidence (§18). No new product features.

## Architecture

```text
packages/core          ──pure domain──►  (no openclaw*, no chrome.*)
packages/protocol      ──schemas──────►  (no openclaw*, no chrome.*; may depend on core)
packages/domscribe-adapter ──SourceResolver──► core only (no openclaw*, no chrome.*)
packages/extension     ──Chrome MV3──►  core + protocol + chrome.*  (NO openclaw*)
packages/openclaw-plugin ──host adapter──► core + protocol + domscribe + openclaw/plugin-sdk/*
packages/mcp-adapter   ──placeholder──►  core/protocol later (FR-031); status export only in MVP
```

Static checker (`scripts/check-adapter-boundary.mjs`) walks `src/**/*.{ts,tsx,js,mjs}` (not `dist/` / `node_modules/`) and fails with `file:line` on forbidden import/require patterns.

## Boundary rules (enforced)

| Package | Forbidden |
|---------|-------------|
| `core` | `openclaw`, `@openclaw/`, `chrome.` / `browser.` WebExtension APIs |
| `protocol` | same as core |
| `domscribe-adapter` | same as core |
| `extension` | `openclaw`, `@openclaw/` (Chrome APIs allowed) |
| `mcp-adapter` | `openclaw`, `@openclaw/`, `chrome.` (placeholder stays host-free) |

Negative proof: fixture sources under `scripts/fixtures/boundary-violations/` intentionally violate rules; checker must exit non-zero when pointed at them.

## License (T-028)

- Root `LICENSE` (MIT) for this repo.
- `THIRD_PARTY_NOTICES.md` documents Design Mode (S-007 / D-002) and Domscribe (S-008 / D-003) MIT attribution even where MVP code is original/inspired rather than a verbatim fork (RISK-008).
- `scripts/check-license-notices.mjs` asserts required notice files/strings exist.

## Docs (§19 + FR-028)

| Doc | Purpose |
|-----|---------|
| `README.md` | Setup, health, pairing, flags, rollback, packages, gates |
| `docs/setup.md` | Install plugin + extension + Labs flag |
| `docs/runbook.md` | Operational runbooks from PRD §19 |
| `docs/compatibility.md` | OpenClaw `>=2026.9.4` (tested 2026.9.5) |
| `docs/architecture.md` | Module boundaries + FR-031 |
| `AGENTS.md` | Point agents at boundary script + INV-5 |

## Release acceptance (§18) — evidence posture

Automated in this slice: static boundary (SCN-024), license notices, existing unit/integration suites from SLC-1..6 (session bind, no-send, degraded Domscribe, closed-loop tools), plugin `validate` (T-026), peer pin `>=2026.9.4`.

Documented (operator): rollback to Built-in composer; no unrestricted Gateway bearer in extension (INV-4); Domscribe absence = degraded.

## Non-goals

- Implementing the generic MCP server
- Feature work in core/protocol/plugin/extension
- Firefox / multi-tenancy / SaaS
