# Composition Gate — slc-2-extension-inspect-bridge

- HEAD_SHA: WORKTREE
- Date: 2026-09-23
- Verdict: CLEAR

## Event
Extension Inspect click publishes `selection.create` over scoped WSS; plugin attaches chip to exact active `(sessionKey, agentId)` without sending.

## Hop chain
Content script inspect click → background bridge client (scoped `ave_*` token)
→ WSS `selection.create` → plugin `bridge-handler` → `VisualBatchStore.attach`
→ `visual_batch_changed` / session extension → composer chip region
→ NEVER `send()` / transcript (INV-1)

## Simulations
| Case | Intended | Composed | Result |
|------|----------|----------|--------|
| 1 event, N actors | Chip only on active session | ActiveSessionTracker + store key | pass |
| invalid / missing | No active session / revoked token → typed error | fail-closed handler | pass |
| 2 consumers / crash | UI + extension share store; revoke kills bridge | PairingStore revoke + reconnect backoff | pass |

## Cardinality
One chip attach per selection.create (dedupe by stable identity). Zero agent runs on selection.

## Flags
(none)

## Skip reason
n/a
