# Feature: SLC-7: Adapter-Boundary-Tests + Docs + Push

## Intent

Abschluss-Slice (PRD §19 SLC-7): Adapter-Boundary hart machen und MVP releasen — ein statischer Architektur-Check erzwingt, dass `core`/`protocol` nie OpenClaw-SDK-/Chrome-API-Imports haben und die Extension nie das OpenClaw SDK (FR-031/SCN-024/INV-5), damit später ein generischer MCP-Server dasselbe Selection/Change/Screenshot-Modell exponieren kann, ohne Extension-Domain-Logik zu ändern. Dazu: License-Scan (T-028), Release-Acceptance-Kriterien (§18), Docs/README/Runbooks. Repo ist bereits auf GitHub; Branch bleibt push-ready (kein Commit durch diesen Agenten).

## Preconditions

- Branch `issue/7-slc-7-adapter-boundary-docs` based on latest `main` (SLC-1..6 merged)
- Node ≥ 24 (`PATH` includes `$HOME/.local/node26/bin`)
- OpenClaw peer `>=2026.9.4` declared; tested against 2026.9.5

## Happy Path

- [ ] Static architecture check grün und negativ-getestet (absichtlicher SDK-/Chrome-Import in core/protocol führt zu fail) (FR-031, SCN-024, INV-5)
- [ ] T-028 License-Scan grün: MIT-Notices für alle Third-Party-Assets (D-002, D-003)
- [ ] Release-Kriterien §18 verifiziert: SCN-002/003/004/007/009/014/022 evidence via existing suites + docs; 0 unintended agent runs; kein unrestricted Gateway-Credential in der Extension; Kompatibilität `>=2026.9.4` deklariert/getestet
- [ ] Docs: README (Setup/Health/Pairing/Flags/Rollback) + Runbook; `mcp-adapter` placeholder remains; repo push-complete on GitHub
- [ ] Touched files: zero type escape hatches (typed-strict / Boy Scout)

## Edge Cases

- Boundary-Verstoß (SDK-Import in core/protocol, Chrome-API dort, SDK in Extension) → Static-Check fail mit file/line
- Inkompatible OpenClaw-Version → Plugin-Aktivierung failt klar statt partial load (§19 Backward compatibility)
- Plugin/Extension defekt → User kann Built-in-Composer jederzeit wählen (§18 criterion 6)
- Fehlende License-Notice → T-028 fail in CI
- Domscribe absent → degraded, not product failure (§18 criterion 7)

## Security Coverage

- BR-001 / INV-1: documented; no new send paths in this slice
- BR-003 / INV-3: covered by existing SLC-1..6 session-binding tests; no regression expected
- INV-4: extension must not store unrestricted Gateway bearer — documented in architecture + runbook; no new credential storage
- INV-5 / FR-031: static boundary check + negative fixtures
- INV-6: Domscribe degraded mode unchanged; documented in README/runbook
- INV-8 / NFR-009: peer `>=2026.9.4` + T-026 validate
- T-028 / D-002 / D-003: LICENSE + THIRD_PARTY_NOTICES + license-scan script
- F-03/B-01 public auth: N/A (no new endpoints)

## Regression

- Existing workspace tests (core/protocol/extension/domscribe/openclaw-plugin) still green
- Plugin `openclaw plugins build` + `validate --json` still green

## Assumptions

- GitHub remote already holds `main` with SLC-1..6; “erster Push” from issue text is already satisfied — this slice keeps docs/gates push-ready without committing from the agent

## Screenshots

| Step | Filename |
|------|----------|
| N/A | docs/tests only |

## Implementation Notes

- `scripts/check-adapter-boundary.mjs` + `scripts/test/adapter-boundary.test.mjs`: positive scan of core/protocol/domscribe/extension/mcp-adapter; negative fixtures under `scripts/fixtures/boundary-violations/`.
- `scripts/check-license-notices.mjs` + `LICENSE` + `THIRD_PARTY_NOTICES.md` (T-028 / D-002 / D-003).
- Docs: README polish; `docs/setup.md`, `runbook.md`, `architecture.md`, `compatibility.md`, `privacy.md`; AGENTS INV-5/8 + QA steps.
- `packages/mcp-adapter` placeholder exports `MCP_ADAPTER_STATUS` + `MCP_ADAPTER_CORE_CONTRACT`; unit test added.
- CI runs `check:boundary` + `check:licenses`; root `npm test` includes boundary tests.
- Composition gate: `.qa/runs/composition-gate-slc-7-adapter-boundary-docs.md` CLEAR; release matrix `.qa/runs/release-acceptance-slc-7.md`.
- Gates green locally; **no commit** per agent instructions (working tree dirty, push-ready when operator commits).
