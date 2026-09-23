# Composition Gate — slc-7-adapter-boundary-docs
- HEAD_SHA: working-tree (issue/7-slc-7-adapter-boundary-docs; uncommitted SLC-7)
- Date: 2026-09-24
- Verdict: CLEAR

## Event
Static architecture enforcement + docs prove FR-031: core/protocol (and placeholder mcp-adapter) stay host-free so a future MCP adapter can reuse selection/change/screenshot without OpenClaw/Chrome coupling. No new runtime hop that starts Send.

## Hop chain
CI / `npm test` → `scripts/check-adapter-boundary.mjs` → scan packages/{core,protocol,domscribe-adapter,extension,mcp-adapter}/src → fail with file:line on openclaw*|chrome.* violations
CI / `npm run check:licenses` → LICENSE + THIRD_PARTY_NOTICES.md (T-028)
Future: mcp-adapter → core/protocol only (placeholder exports contract names today)

## Simulations
| Case | Result |
|------|--------|
| N actors | Multiple packages scanned independently; openclaw-plugin may use SDK, extension may use chrome — cross-boundary imports forbidden | pass |
| invalid | Fixtures under scripts/fixtures/boundary-violations/ force non-zero / test fail | pass |
| crash / concurrent | Checker is pure FS read; missing package root = zero files, not throw; CI fails closed on any violation | pass |

## Notes
- INV-1 unchanged: no agent run from selection/docs/checks.
- Rollback UI path documented in docs/runbook.md (Built-in composer).
