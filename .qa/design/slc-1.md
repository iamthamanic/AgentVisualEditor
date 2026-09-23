# SLC-1 binding design — Native chat binding + chips

## Goal

Prove OpenClaw can show non-executing visual chips in the exact current chat (PRD §19 SLC-1).

## Domain (`packages/core`)

- Entities: `VisualSelection`, `VisualBatch`, `VisualChange`, `SourceContext`
- Batch states: `draft → preparing → sent | cleared | expired`
- `rejectSend`: preparing → draft, chips retained
- Limits: selection JSON ≤256KiB, DOM ≤100KiB, runtime summary ≤64KiB, max 10 chips/draft
- Dedup key: `tag + selector + textSummary` (normalized)
- `redactText`: email, `sk-`, `ghp_`, `Bearer …`
- Errors: `PayloadTooLargeError`, `LimitReachedError`, `InvalidBatchStateError`

## Protocol (`packages/protocol`)

- `PROTOCOL_VERSION = 1`
- TypeBox schemas: C-006 `selection.create`, C-007 `selection.remove`, C-008 `selection.update`, C-009 `artifact.upload`
- `ErrorEnvelope` codes + `parseInbound`

## OpenClaw plugin (`packages/openclaw-plugin`)

- Feature ops (no agent tools; snake_case ids required by SDK): `get_visual_batch`, `attach_test_selection`, `remove_selection`, `clear_visual_batch`, `get_ui_flags` (aliases of getVisualBatch / attachTestSelection / …)
- `VisualBatchStore` keyed `${agentId}::${sessionKey}`
- Session extension namespace `visualBatch` with project/cleanup
- Composer replacement: chip region **above** `context.mountDefault(built-in)`
- Health page id `ave-health`
- Config: `composerUiEnabled`, `testSelectionEnabled` (debug)
- Fail-closed binding via `bindSessionIdentity`
- peerDep `openclaw >=2026.9.4`

## Composer UX

- CSS prefix `ave-`, host theme vars
- Label priority: `Component · file:line` → `tag · text` → `Element · selector`
- Remove (× aria-label), clear all — draft text untouched
- Canonical `setDraft` / `send` only

## Tests

- T-001 core limits/dedup/state/redaction
- T-002 multi-session isolation
- T-005 session targeting + mocked canonical send path
