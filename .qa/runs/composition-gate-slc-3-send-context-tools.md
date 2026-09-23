# Composition Gate — slc-3-send-context-tools

- HEAD_SHA: 9df2d0b19e0da5865242b1e471c6d251318d624b
- Date: 2026-09-23
- Verdict: CLEAR

## Event
Explicit user Send with chips prepares exactly one VisualBatch, injects compact next-turn context on admit only; reject restores draft chips with no leak to a later message.

## Hop chain
UI Senden / prepare_send → VisualBatchStore.beginPrepare
→ props.send() admission
→ send_outcome admit → enqueueNextTurnInjection + archive for tools
→ OR reject → rejectSend (chips retained, no injection)

## Simulations
| Case | Intended | Composed | Result |
|------|----------|----------|--------|
| 1 event, N actors | Context only for admitting session | session-bound prepare + tools | pass |
| invalid / missing | Cross-session tool deny; no identity fail-closed | bindSessionIdentity + tool auth | pass |
| 2 consumers / crash | Rejected prep cannot admit later | preparationId consume-once | pass |

## Cardinality
One preparation per Send; one next-turn injection per admitted Send. Zero injections on reject.

## Flags
(none)
