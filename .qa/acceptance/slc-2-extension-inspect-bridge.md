# Acceptance — slc-2-extension-inspect-bridge

## Intent

Chrome MV3 extension with Cursor-like Inspect Mode pairs securely to the OpenClaw plugin (plugin-scoped token only), opens a WSS bridge, and attaches bounded VisualSelections as chips in the exact active `(sessionKey, agentId)` chat — without auto-send (INV-1).

## Preconditions

- SLC-1 merged: `VisualBatchStore`, composer chips, `ave-health` page
- OpenClaw host ≥2026.9.4; Custom Plugin UI enabled for native composer
- Extension loaded as unpacked MV3 build from `packages/extension/dist`

## Happy Path

1. Given plugin health page, when operator starts pairing, then a one-time code + expiry is shown (C-001).
2. Given a valid code in the extension Connection view, when pairing completes, then extension stores scoped token + connectionId only (no Gateway bearer) and shows Connected (C-002, INV-4).
3. Given Connected + active OpenClaw session, when user enables Inspect and clicks an element, then a chip appears in that exact chat and 0 agent runs / 0 transcript messages occur (C-006, INV-1, SCN-002/003).
4. Given a chip, when user removes it in composer or extension, then draft text is unchanged (SCN-005).
5. Given bridge drop or MV3 service-worker restart, when reconnect succeeds, then local unsent selections are preserved (FR-027, SCN-011).

## Edge Cases

- Invalid/expired pairing code → `invalid_code` / `expired_code` with retry UI
- Revoke → active WSS terminated; extension shows Re-pair required (SCN-012)
- No active session → `no_active_session`; chip not attached
- Duplicate stable identity → update/focus, not second chip (EDGE-001)
- Shadow DOM closed / cross-origin iframe / missing site permission → typed fallback or visible remediation (EDGE-002/003/010, FR-033)
- Oversize payload → `payload_too_large`
- requestId replay → idempotent dedupe

## Acceptance

- [ ] T-004: pair/revoke/deny — Revocation terminates active bridge sessions; extension holds no Gateway token (SCN-001, SCN-012, INV-4)
- [ ] T-006 path (unit/integration): selection.create → VisualBatchStore chip for exact session; selection/remove produce 0 sends (SCN-002/003/005)
- [ ] T-014 + T-020 path: reconnect backoff + local state rehydrate helpers covered by unit tests (SCN-011)
- [ ] EDGE-002/003/010: inspect capture returns typed limitation codes instead of silent failure
- [ ] Root `npm run typecheck && npm run build && npm test` green; plugin `build` + `validate` green
- [ ] Touched files: zero type escape hatches (typed-strict / Boy Scout)

## Security Coverage

- INV-4 / FR-001 / FR-026: plugin-scoped pairing token only; revoke terminates sockets — pairing store + bridge routes
- INV-1 / BR-001: selection ops call VisualBatchStore only; never `send` / transcript
- INV-3 / BR-003: selections attach only to ActiveSessionTracker identity; missing → `no_active_session`
- BR-004 / BR-005: core limits + dedup via existing store.attach
- BR-010: page content treated as data; core redaction on admit; no raw token/page dumps in logs
- NFR-004: remote bridge expects HTTPS/WSS base URL; loopback HTTP allowed for local dev
- B-01/B-04: pairing.complete + bridge use `auth: "plugin"`; admin pairing.start/revoke via feature ops (Gateway session scope)
- F-03/B-07/B-08/B-09/P-04: N/A or covered — no client-supplied session retarget; fail-closed active session

## Regression

- SLC-1 composer chips, test-selection (when enabled), and session binding tests remain green

## Assumptions

- Active session is reported by the composer replacement via `report_active_session` (exact sessionKey/agentId from host props).
- Artifact upload (C-009) returns `forbidden` until SLC-5.
- Domscribe side-panel state is a stub (`unavailable`) until SLC-4.

## Screenshots

| Step | Filename |
|------|----------|
| 1 | `01-happy-path.png` |

## Implementation Notes

- Protocol: C-001..C-005 TypeBox schemas + parse helpers; ErrorEnvelope adds `invalid_code` / `expired_code` / `rate_limited`.
- Plugin: `PairingStore` (hashed codes/tokens), `ActiveSessionTracker` (C-005), `BridgeMessageHandler` → existing `VisualBatchStore`, HTTP/WSS via `registerHttpRoute` + `openclaw/plugin-sdk/websocket-runtime`.
- Routes: `POST /agent-visual-editor/pairing/complete` (auth plugin), WSS `/agent-visual-editor/bridge` (Bearer/`?token=`).
- Feature ops: `pairing_start`, `connection_revoke`, `list_connections`, `report_active_session`, `get_health`.
- Control UI: AVE Status pairing UI (DE); composer calls `report_active_session` on mount/update/dispose.
- Extension MV3 packed to `packages/extension/dist-ext/` (esbuild): SW, content inspect overlay, German side panel.
- INV-1 preserved: selection path never calls send. INV-4: tokens are `ave_*` scoped; Gateway bearer never stored.
- C-009 artifact.upload returns `forbidden` until SLC-5. Domscribe UI stub = `unavailable` (SLC-4).
- Tests: protocol parse; plugin T-004; extension reconnect/URL helpers. Root typecheck/build/test + plugin validate green.
- No commit/push/PR — working tree left for `@verify-ticket`.

## Composition Gate

See `.qa/runs/composition-gate-slc-2-extension-inspect-bridge.md` — Verdict CLEAR (de4d64f1616896a9e9e25f46acd654f62906a8c6).
