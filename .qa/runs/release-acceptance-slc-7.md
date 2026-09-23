# Release acceptance evidence — SLC-7 / §18

Recorded for issue #7. Automated gates: `npm run typecheck && npm run build && npm test && npm run check:boundary && npm run check:licenses` plus plugin validate.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| 1. SCN-002/003/004/007/009/014/022 | Covered by SLC-1..6 suites | core T-001/T-002; plugin T-005/T-015/T-024/T-025/T-026; extension preview tests; domscribe T-024 |
| 2. 0 unintended agent runs | INV-1 | Chip/selection paths never call Send; documented in AGENTS.md + runbook |
| 3. Cross-session security | INV-3 | T-002, T-005, T-025, closed-loop tests — fail-closed `forbidden` |
| 4. No unrestricted Gateway credential in extension | INV-4 | Pairing-scoped storage only; architecture + privacy docs |
| 5. Compatibility declared/tested | INV-8 | `>=2026.9.4`, tested `2026.9.5`; docs/compatibility.md; T-026 validate |
| 6. Revert to Built-in composer | NFR-015 | docs/runbook.md + docs/setup.md |
| 7. Domscribe absence = degraded | INV-6 / FR-029 | domscribe-adapter degraded paths; runbook |
| 8. Third-party license notices | T-028 | LICENSE + THIRD_PARTY_NOTICES.md + `check:licenses` |

SCN-024 / FR-031: `check:boundary` + negative fixtures + mcp-adapter placeholder.
