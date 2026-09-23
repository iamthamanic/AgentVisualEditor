# Composition Gate — security-hardening-audit

- HEAD_SHA: 5719f05f073141cd0aa3ed09c27a46d2503ccaad
- Date: 2026-09-24
- Verdict: CLEAR

## Event

Agent requests `apply_preview` for a selection; browser applies allowlisted styles once on the owning tab; result returns only from the owning bridge connection.

## Hop chain

Tool/agent (`apply_preview`) → `runApplyPreview` (session-scoped requestId dedupe + allowlist) → `BridgeHub.requestPreviewApply` (unicast to selection owner) → extension service-worker (selectionId→tabId) → content `agent-preview` (`style.setProperty`) → `preview.apply.result` (ownerConnectionId check) → store `recordPreviewApply` → tool result / Control UI

Secondary: `selection.create` → admit + `sanitizePageUrl` → ArtifactStore (caps) → optional `artifact.upload` (sanitized pageUrl)

Secondary: pairing.complete → rate limit per extensionInstanceId → scoped `ave_*` token → WSS via Sec-WebSocket-Protocol

## Simulations

| Case | Intended | Composed | Result |
|------|----------|----------|--------|
| 1 event, N actors | One apply per requestId per session; one browser mutation on owner tab | Session-keyed dedupe; unicast to owner; tab map (no active-tab fallback) | pass |
| invalid / missing | No host session → no_session_context; unsafe CSS rejected; unknown owner → browser_unavailable; foreign apply.result ignored | Fail-closed INV-3 + BR-009 + owner checks | pass |
| 2 consumers / crash | Second socket cannot resolve pending apply; same requestId other session independent; crash → timeout then retry with new id | pendingApplies ownerConnectionId; session-scoped cache | pass |

## Flags

| Tag | Severity | Hops | Why local review missed it | Fix |
|-----|----------|------|----------------------------|-----|
| cardinality: | note | apply → all sockets | Was broadcast before hardening | done (unicast) |
| silent-fallback: | note | binding without host context | Request identity substituted | done (host required) |
| identity: | note | requestId global cache | Cross-session replay | done (session-scoped) |
| race: | note | apply.result any socket | Spoofed result | done (owner check) |

## Skip reason

n/a
