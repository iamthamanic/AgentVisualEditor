# SLC-3 design — Send context + agent tools

## Goal

On explicit user Send with chips, make a compact VisualBatch representation available to exactly that next agent turn (FR-021), and register read-only session-bound agent tools (FR-022/FR-023). Cross-session fail-closed (INV-3). Rejected sends must not leak prepared context (RISK-004 / SCN-014).

## Architecture

```text
Composer (mountDefault)          Plugin backend
───────────────────────          ─────────────────────────────
User Send ──► prepare_send ──► VisualBatchStore (preparing + preparationId)
         │                         │
         ├── props.send()          │ (no enqueue yet)
         │                         ▼
         └── send_outcome ──► admitted?
                │                 ├── yes: enqueueNextTurnInjection + archive sent + empty draft chips
                │                 └── no:  rejectSend → draft chips retained; never enqueue
                ▼
         Agent turn drains injection (this turn only)

Fallback (mountDefault without UI wrap):
  api.on("agent_turn_prepare") → if draft/preparing chips for exact session:
    prependContext + admit/archive (turn only runs when host admitted)

Tools (contract.tool → registerTool):
  agent_visual_editor.get_active_context
  agent_visual_editor.get_selection
  agent_visual_editor.get_screenshot  (stub: not_found until SLC-5 artifacts)
```

## Domain (`packages/core`)

- `VisualBatch.revision` + `preparationId` while `preparing`
- `prepareSend` / `admitSend` / `rejectSend` (existing transitions)
- `buildCompactNextTurnContext(batch)` — redacted, bounded, untrusted-page framing (BR-010)
- No large DOM/screenshot in compact text

## Plugin (`packages/openclaw-plugin`)

| Op / tool | Contract | Notes |
|-----------|----------|-------|
| `prepare_send` | C-010 | One active preparation per batch revision; `stale_batch` / `unavailable_context` |
| `send_outcome` | C-011 | Idempotent on preparationId; `stale_preparation`; admit clears chips (SCN-021) |
| `get_active_context` | C-012 tool | Active/sent archive for caller session only |
| `get_selection` | C-013 tool | Selection detail; bounded + redacted |
| `get_screenshot` | C-014 tool | Stub until artifact store (SLC-5) |

- `VisualBatchStore`: working draft + `admittedBySession` archive for tools after chip clear
- Binding via existing `bindSessionIdentity` (tool context sessionKey/agentId)
- German user-facing errors (FR-033)
- Cleanup on session extension delete/reset retires archive (EDGE-005)

## Composer wiring

- Prefer wrapping canonical `context.props.send` around prepare/outcome when the replacement drives send.
- With `mountDefault`, built-in Send is host-owned → `agent_turn_prepare` fallback injects only when the turn actually runs (rejected host send never injects).

## Non-goals

- Domscribe (SLC-4), screenshots upload (SLC-5), apply_preview / mark_resolved (SLC-6)

## Tests

- T-015: rejectSend restores draft chips; no injection / no admitted archive for later turns
- T-025: compact context exact for `(sessionKey, agentId)`; cross-session tool deny
- SCN-021: admitted send → chip projection empty; transcript has no metadata message (injection only)

## Ready for /implement

YES
