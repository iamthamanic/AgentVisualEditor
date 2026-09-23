# SLC-6 design — Closed-Loop (apply_preview, mark_resolved)

## Goal

Agent can apply allowlisted CSS preview styles to a known selection in the paired browser (FR-024 / C-015) and mark changes resolved after source work (FR-025 / C-016), closing the inspect → edit → HMR → re-inspect loop (SCN-015 / SCN-018). No arbitrary JS (BR-009). Feature flag `agentPreviewApplyEnabled` defaults **false** until security tests pass (§19).

## Architecture

```text
Agent tool apply_preview (C-015)
        │  flag + session bind (INV-3) + allowlist (server)
        ▼
  BridgeHub.requestPreviewApply ──WSS──► Extension BridgeClient
        │                                      │
        │                                      ▼
        │                              AgentPreviewStylesheet
        │                              (separate from page CSS;
        │                               disable/revert = RISK-009)
        │                                      │
        ◄──────── preview.apply.result ────────┘
        │
        ▼
  VisualBatchStore upsert pending VisualChange + revision

Agent tool mark_resolved (C-016)
        │  session bind; idempotent
        ▼
  VisualBatchStore set change status → resolved (BR-008: source-fixed, not extension write)
```

## Boundaries

- **Allowlist only:** style properties from shared core list; unsafe CSS values rejected; no `eval` / script injection (BR-009).
- **Server + client enforce:** plugin rejects `forbidden_property` before bridge; content executor re-checks.
- **Session fail-closed:** exact `sessionKey` + `agentId` (INV-3); cross-session → `forbidden`.
- **Active context only:** tools resolve selection via `getActiveContextBatch` (preparing/sent or admitted archive) — same as C-012/C-013.
- **INV-1:** apply/mark never start a Send / agent run.
- **INV-5:** allowlist + validators live in `packages/core`; protocol carries bridge envelopes; no OpenClaw types in core/protocol.
- **BR-008:** `mark_resolved` means agent/source addressed the change — extension does **not** write source. Tool output documents this.

## Feature flag

| Flag | Default | Effect |
|------|---------|--------|
| `agentPreviewApplyEnabled` | `false` | C-015 disabled → typed `forbidden`. C-016 remains available. |

Enable in tests/config for verification. Rollback = leave flag false (Inspect/chips/Design tab unaffected).

## C-015 `apply_preview`

**Input:** `selectionId`, `styles: { property, value }[]`, optional `requestId`

**Flow:**
1. Flag check → else `forbidden`
2. Session bind → else `no_session_context` / `forbidden`
3. Find selection in active context → else `not_found`
4. Validate each property/value → else `forbidden_property`
5. If no paired bridge socket → `browser_unavailable`
6. Push `preview.apply` with selector from selection; await result (timeout → `browser_unavailable`)
7. Extension: locate element; missing/replaced → `stale`; apply via dedicated stylesheet; ack
8. Upsert pending `VisualChange` (kind `style`) per property; bump batch revision
9. Return `{ ok, applied, revision, selectionId, requestId }`

**Concurrency:** same `requestId` deduped; otherwise latest explicit apply wins per property.

## C-016 `mark_resolved`

**Input:** `changeId` and/or `selectionId` (at least one)

**Semantics:** set matching change(s) to `status: "resolved"`. Already-resolved → success (idempotent). Missing → `not_found`. Cross-session → `forbidden`.

Does not clear preview stylesheet (user/agent may clear separately for HMR verify — RISK-009).

## Protocol (plugin ↔ extension)

| Message | Direction | Notes |
|---------|-----------|-------|
| `preview.apply` | plugin → extension | requestId, selectionId, selector, styles[] |
| `preview.apply.result` | extension → plugin | ok + applied[] **or** ErrorEnvelope (`stale`, …) |
| `preview.clear` | plugin → extension (optional helper) | disable agent stylesheet for selection / all |

Error codes added for tools: `forbidden_property`, `browser_unavailable` (plus existing `stale`, `forbidden`, `not_found`).

## Extension executor

- Dedicated `<style id="ave-agent-preview">` (or equivalent) — **not** page stylesheet; not Design-tab inline state.
- Track overrides by `selectionId` + property for revert/clear.
- Re-validate allowlist + safe values before apply.
- Stale selector → typed error, no silent rematch (SCN-016).

## Tests

- Allowlisted apply success (flag on) + VisualChange pending + revision
- Forbidden property rejected server-side (flag on)
- Flag default / off → apply forbidden; mark_resolved still works
- `mark_resolved` idempotent; pending→resolved
- Cross-session forbidden
- Mock browser: `stale` / `browser_unavailable`

## Non-goals

- Arbitrary JS / text-content apply via agent (MVP styles only)
- Source-code writes by extension (BR-008)
- Design-tab / screenshot / Domscribe changes
- Composer / Send-context changes

## Ready for /implement

YES
