# Acceptance — slc-1-chat-binding-chips

## Intent

Cursor-artiger Visual Editor für OpenClaw — Fundament-Slice: beweist, dass OpenClaw nicht-ausführende Visual-Chips im exakt aktuellen Chat anzeigen kann (PRD §19 SLC-1). Monorepo-Packages `core`, `protocol`, `openclaw-plugin` werden implementiert; der Built-in-Composer wird via `context.mountDefault(container)` komponiert und um eine Chip-Region erweitert. Kern-Invariante: Selektion/Chip-Operationen erzeugen NIEMALS einen Agent-Run oder eine Transcript-Message — nur explizites Send (INV-1).

## Acceptance

- [ ] Selektions-/Chip-Operationen erzeugen 0 Agent-Runs und 0 Transcript-Messages; Cardinality: genau eine Batch-Preparation pro explizitem User-Send-Event (INV-1, SCN-003, FR-007)
- [ ] T-001 + T-002 grün: Limits (10/Draft), Dedup, State-Transitionen (draft/preparing/sent/cleared/expired), Redaction-Muster (sk-/ghp_/Bearer/E-Mail); Multi-Session-Isolation ohne Cross-Session-Migration (FR-005, FR-009, FR-010)
- [ ] T-005: Chip-Targeting exakt für `(sessionKey, agentId)` über zwei Sessions; Send-Pfad kanonisch (`setDraft`/`send`), kein Raw-Chat-RPC (FR-019, FR-020)
- [ ] `openclaw plugins build` + `plugins validate --json` in `packages/openclaw-plugin` grün; Root `npm run typecheck && npm run build && npm test` grün (T-026)
- [ ] Touched files: zero type escape hatches (typed-strict / Boy Scout)

## Preconditions

- OpenClaw host ≥2026.9.4 with Custom Plugin UI enabled for native composer replacement
- Plugin installed/built; `testSelectionEnabled` for debug path

## Happy Path

1. Given an active session `(sessionKey, agentId)`, when Test-Selektion fires, then a chip appears and no agent run starts.
2. Given chips in draft, when user removes one or clears all, then draft text is untouched and store updates only that session.
3. Given two sessions, when chips attach to A, then B remains empty (no migration).
4. Given preparing batch, when send is rejected, then state returns to draft with chips retained.

## Edge Cases

- 11th chip → `limit_reached`
- Duplicate stable identity → update/focus (dedupe), not second chip
- Missing session identity → `no_session_context`
- Cross-session invoke → `forbidden`

## Security Coverage

- BR-001 / INV-1: chip ops have no send/transcript side-effect — covered by T-005 + UI using only feature ops / mountDefault
- BR-003 / INV-3: `bindSessionIdentity` — T-005
- BR-004 / BR-005 / BR-006: core limits/dedup/isolation — T-001/T-002
- BR-010: `redactText` — T-001
- F-03/B-01/B-04/B-07/B-08/B-09/P-04: N/A (no public HTTP auth surface in SLC-1; ops use Gateway session-action scopes)

## Composition Gate

See `.qa/runs/composition-gate-slc-1-chat-binding-chips.md` — Verdict CLEAR (WORKTREE; refresh SHA after commit).

## Implementation Notes

- Feature op IDs are snake_case (`get_visual_batch`, …) because OpenClaw requires `/^[a-z][a-z0-9._-]+$/`.
- No agent tools registered in SLC-1 (tools deferred to SLC-3).
- Composer uses `mountDefault` under chip region; canonical `setDraft`/`send` remain with built-in composer.
