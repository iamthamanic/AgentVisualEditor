# Feature: Security hardening audit (remaining findings)

<!-- refined by /implement on 2026-09-24 from audit follow-up -->

## Intent

Close remaining medium/low security findings on `fix/security-hardening-audit`: session-scoped apply dedupe, preview.apply.result owner check, selection-tab apply routing, artifact pageUrl sanitization, CSS/URL filters, revert oldValue re-check, pairing complete rate limit per extension, and report_active_session clear DoS.

## Preconditions

- Branch `fix/security-hardening-audit` with prior hardening already applied (sanitize-url, relay-url, etc.)

## Happy Path

- [x] Same `requestId` in different sessions does not collide in apply_preview dedupe
- [x] `preview.apply.result` from non-owner connection is ignored
- [x] Agent preview apply/clear targets the tab that owns `selectionId` (not silent active-tab fallback)
- [x] Artifact `pageUrl` is sanitized before store
- [x] CSS reject list covers image-set/element/attr/-moz-binding/behavior; `background` shorthand removed from allowlist
- [x] Sensitive query keys expanded in `sanitizePageUrl`
- [x] Preview revert skips unsafe non-empty `oldValue`
- [x] Pairing complete failures rate-limited per `extensionInstanceId`
- [x] `report_active_session` clear/ambiguous only when caller owns current active (or none)

## Edge Cases

- [x] Missing selection→tab mapping + no pageUrl match → `browser_unavailable` / stale (no active-tab apply)
- [x] Loopback `?token=` kept as accepted local-gateway risk (comment)

## Security Coverage

- BR-003 / INV-3: session-scoped dedupe + active-session clear ownership
- BR-009: CSS allowlist/value filters + revert re-check
- BR-010: pageUrl sanitization on artifacts + expanded query keys
- INV-4: pairing complete rate limit per extension instance
- NFR: preview.apply.result ownerConnectionId check

## Composition Gate

- Verdict: CLEAR
- Proof: `.qa/runs/composition-gate-security-hardening-audit.md`

## Implementation Notes

- Session-scoped apply dedupe key `${agentId}::${sessionKey}::${requestId}` in `preview-apply.ts`; cross-session same requestId test in `t026`
- `pendingApplies` stores `ownerConnectionId`; `resolvePendingApply(raw, connectionId)` ignores foreign sockets
- Extension tracks `selectionId→tabId` via capture sender + bridge `requestId` ack; agent apply/clear never uses active tab
- Artifact `pageUrl` sanitized via `sanitizePageUrl` in `bridge-handler.ts`
- CSS: dropped `background` shorthand; reject `image-set(`/`element(`/`attr(`/`-moz-binding`/`behavior:`
- Sensitive query keys expanded in `sanitize-url.ts`
- Preview revert re-checks `oldValue` with `isSafeCssValue`
- Pairing complete failures rate-limited per `extensionInstanceId` (start remains global)
- `report_active_session` clear/ambiguous denied unless caller owns current active (or none)
- Loopback `?token=` kept with comment (accepted local-gateway risk)
- Verify: typecheck, lint, build, test, check:boundary, plugin validate — all green
