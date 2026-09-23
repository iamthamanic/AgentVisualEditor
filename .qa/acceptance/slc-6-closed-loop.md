# Feature: SLC-6: Closed-Loop (apply_preview, mark_resolved)

<!-- refined by /implement on 2026-09-24 from issue #6 + .qa/design/slc-6.md -->

## Intent

Closed-Loop (PRD §19 SLC-6): Agent und Browser können kontrollierte Änderungen verifizieren — `agent_visual_editor.apply_preview` wendet nur allowlisted CSS-Properties im gepairten Browser an (FR-024; BR-009: kein arbitrary JS), `agent_visual_editor.mark_resolved` markiert Change-Status nach Source-Änderung (FR-025). Loop: Agent editiert Code → HMR → re-inspect → Preview/Resolved-Status schließt den Kreis (SCN-015/SCN-018). Feature-Flag `agentPreviewApplyEnabled` default false bis Security-Tests grün.

## Preconditions

- SLC-1..5 on branch (chips, bridge, send tools, Domscribe, Design-tab VisualChange)
- C-012..C-014 agent tools + session binding pattern exist
- Allowlisted style properties exist in extension Design path (promote to core for shared enforcement)
- `VisualChangeStatus` includes `resolved` (reserved in SLC-5)

## Happy Path

- [ ] Given `agentPreviewApplyEnabled: true` and active-context selection, when agent calls `apply_preview` with allowlisted styles, then browser applies via separate preview stylesheet, store gets pending VisualChange, tool returns applied + revision (C-015 / FR-024 / SCN-018)
- [ ] Given non-allowlisted property or unsafe CSS value, when apply_preview, then typed `forbidden_property` and no browser mutate (BR-009)
- [ ] Given default / `agentPreviewApplyEnabled: false`, when apply_preview, then `forbidden`; Inspect/chips/Design and mark_resolved still work (§19 Rollout)
- [ ] Given pending change in active context, when mark_resolved (by changeId and/or selectionId), then status `resolved`; repeat is idempotent; output documents BR-008 (no source write) (C-016 / FR-025)
- [ ] Given DOM replace / missing selector, when apply, then typed `stale` (SCN-016); no paired browser → `browser_unavailable`
- [ ] Cross-session tool call → `forbidden` / `no_session_context` (INV-3)
- [ ] INV-1: apply_preview / mark_resolved never prepare/admit Send
- [ ] Touched files: zero type escape hatches (typed-strict)

## Edge Cases

- [ ] Multiple rapid applies: requestId dedupe; otherwise latest explicit change wins per property
- [ ] RISK-009: agent preview overrides tracked separately; clear/disable stylesheet restores live page for HMR verify (SCN-015)
- [ ] Apply on unknown selection → `not_found`
- [ ] mark_resolved on missing change → `not_found`; already resolved → ok

## Regression

- [ ] SLC-1..5 tests remain green
- [ ] `npm run typecheck && npm run build && npm test` + plugin validate green

## Assumptions

- Agent apply uses a dedicated content stylesheet (`ave-agent-preview`), distinct from Design-tab inline previews
- C-016 does not require `agentPreviewApplyEnabled` (only C-015 is gated)
- MVP agent apply is style-only (no text-content apply via tool)
- Bridge RPC timeout treated as `browser_unavailable`

## Screenshots

| Step | Filename |
|------|----------|
| 1 | `01-n/a-headless.png` |

## Security Coverage

- BR-001 / INV-1: apply/mark never send
- BR-003 / INV-3: exact session bind fail-closed
- BR-008: mark_resolved = source/agent addressed; no extension source write; documented in tool result
- BR-009: allowlist + safe CSS; no arbitrary JS; server + client enforce
- BR-010: page/selector treated as untrusted data; redaction path unchanged
- NFR-006: style values bounded (≤256 chars); selection caps unchanged
- INV-4: scoped extension token only (existing bridge auth)
- §19: `agentPreviewApplyEnabled` default false

## Composition Gate

- HEAD_SHA: c167ea7170be8e56c8b3962593a8741b98d9f9d2 (base; uncommitted SLC-6)
- Verdict: CLEAR
- Proof: `.qa/runs/composition-gate-slc-6-closed-loop.md`
- Skip reason: n/a

## Implementation Notes

- Files: `.qa/design/slc-6.md`; `packages/core` (shared allowlist + markResolved/upsertStylePreviewChange); `packages/protocol` (`preview.apply` / `preview.apply.result` / `preview.clear` + error codes); `packages/openclaw-plugin` (`agentPreviewApplyEnabled` default false, C-015/C-016 tools, BridgeHub RPC, store record/mark); `packages/extension` (agent-preview stylesheet executor, bridge/service-worker wiring)
- Tests: core allowlist + resolve helpers; extension agent-preview forbidden_property; plugin `t026-closed-loop.test.ts` (apply, forbidden property, flag off, mark_resolved, stale, browser_unavailable, dedupe)
- Validation: `npm run typecheck && npm run build && npm test` + `cd packages/openclaw-plugin && npm run validate` green
- No commit — working tree left for review / verify-ticket
