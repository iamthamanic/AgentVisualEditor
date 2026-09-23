# Composition Gate — slc-6-closed-loop
- HEAD_SHA: c167ea7170be8e56c8b3962593a8741b98d9f9d2 (base; working tree SLC-6)
- Date: 2026-09-24
- Verdict: CLEAR

## Event
Agent apply_preview / mark_resolved mutate only the caller's active-context VisualBatch; preview CSS goes to a dedicated stylesheet; never Send.

## Hop chain
Agent tool → session bind (INV-3) → allowlist (core) → BridgeHub preview.apply → extension agent-preview stylesheet → preview.apply.result → store.recordPreviewApply / markResolved

## Simulations
| Case | Result |
|------|--------|
| N actors | Exact sessionKey+agentId; cross-session forbidden | pass |
| invalid | Flag off / forbidden_property / missing selection fail-closed | pass |
| crash / concurrent | requestId dedupe; latest property wins; no retry loop on browser_unavailable | pass |
