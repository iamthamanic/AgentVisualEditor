# Operations runbook

Incident owner: implementation maintainer (until assigned). Related: PRD §19.

## Extension cannot connect

1. Confirm OpenClaw Gateway is running and reachable (loopback or HTTPS/WSS).
2. Confirm extension pairing token is present and not revoked.
3. Check protocol version handshake errors in plugin diagnostics / extension Connection.
4. Reload the extension service worker (`chrome://extensions` → service worker).
5. Re-pair with a fresh code if auth failures repeat.

## Custom Plugin UI disabled

1. OpenClaw **Settings → Labs → Custom plugin UI** must be enabled.
2. Without it, AVE composer replacement will not load; Built-in composer remains usable.
3. Re-select **AVE Composer mit Chips** after enabling Labs.

## No active chat detected

1. Open or focus an OpenClaw chat session so `sessionKey` + `agentId` exist.
2. Extension/plugin fail closed on missing identity (`no_session_context`) — they never guess (INV-3).
3. If two windows compete, use the manual session picker rather than auto-attach (EDGE-015).

## Domscribe not detected

1. Expected for pages without `data-ds` / relay — status **unavailable** / degraded.
2. Do **not** treat as bridge failure (FR-029).
3. Chips and selector/screenshot context still work (INV-6).
4. Optional: set `domscribeRelayUrl` / enable project instrumentation; retry resolve independently.

## Chip appears in wrong/old session

1. Verify focused chat identity; chips are bound to exact `(sessionKey, agentId)`.
2. There is no automatic chip migration across sessions (BR-006).
3. Clear chips in the wrong session; re-select in the correct chat.
4. If binding looks stale after session delete/reset, retire the draft and target another chat (EDGE-005).

## Send rejected with chips

1. Chip edits never start a run — only Send does (INV-1).
2. On rejected/admission-blocked send, chips stay in draft; retry after host allows send (EDGE-009 / SCN-014).
3. Do not manually inject prompt text outside the canonical `prepare_send` / `send` path.

## Plugin upgrade breaks composer

1. In OpenClaw plugin customization, switch UI back to **Built-in** composer (NFR-015 / §18.6).
2. Chat must remain usable without AVE.
3. Roll back to the previous known-good plugin artifact / pin OpenClaw to a tested version (`>=2026.9.4`, tested `2026.9.5`).
4. Re-run `npm run validate` in `packages/openclaw-plugin` before re-enabling AVE UI.

## Pairing token compromised / revoke all

1. Revoke the extension token from AgentVisualEditor / plugin settings (FR-026).
2. Uninstall or clear extension local pairing storage if the device is untrusted.
3. Generate a new pairing code; re-pair only trusted browsers.
4. Confirm no unrestricted Gateway bearer is stored in the extension (INV-4) — only plugin-scoped credentials.
