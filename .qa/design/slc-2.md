# SLC-2 design — Extension inspect + secure bridge

## Goal

User can Inspect a page element and see a chip automatically in the exact OpenClaw chat (PRD §19 SLC-2), without auto-send (INV-1). Extension pairs with plugin-scoped credentials only (INV-4).

## Architecture

```text
Chrome MV3 extension                    OpenClaw plugin
─────────────────────                   ─────────────────
Side panel (DE UI)  ──HTTP──►  pairing.complete (auth: plugin)
Service worker      ──WSS───►  /agent-visual-editor/bridge
Content inspect     ──msg──►   SW → selection.create/remove/update
                                │
                                ▼
                         VisualBatchStore (SLC-1)
                                │
                                ▼
                         Composer chips (mountDefault)
```

## Protocol (`packages/protocol`)

| ID | Message / HTTP | Direction |
|----|----------------|-----------|
| C-001 | `pairing.start` | Control UI / feature op → code+expiry |
| C-002 | `pairing.complete` | Extension HTTP POST → scoped token + connectionId |
| C-003 | `connection.revoke` | Control UI / feature op → terminate WSS |
| C-004 | `bridge.hello` | Extension → plugin over WSS |
| C-005 | `activeSession.changed` | Plugin → extension (monotonic revision) |
| C-006..C-008 | selection.* | Extension → plugin → VisualBatchStore |
| C-009 | artifact.upload | Stub: `forbidden` until SLC-5 |

New ErrorEnvelope codes: `invalid_code`, `expired_code`, `rate_limited`.

## Plugin bridge

- HTTP path prefix: `/agent-visual-editor`
  - `POST /agent-visual-editor/pairing/complete` — auth `plugin` (code in body)
  - `GET|Upgrade /agent-visual-editor/bridge` — auth `plugin`; WSS token via `Authorization: Bearer <token>` or `?token=`
- Pairing: one-time code (TTL 5 min), issues connectionId + scoped token (stored hashed)
- Revoke: drops credential + closes active sockets for that connectionId
- Active session: composer `update`/`mount` calls `report_active_session` with exact `(sessionKey, agentId, title?)`; tracker pushes C-005 to all live bridges
- Fail-closed: no active session → `no_active_session` on selection.create
- requestId dedupe for selection mutations (in-memory, bounded)

## Extension (`packages/extension`)

- Manifest V3: service worker (module), content script, side panel
- German UI strings
- Inspect: hover outline (no DOM mutation of page content beyond overlay), click → bounded VisualSelection
- Shadow DOM: open roots traversed; closed → typed fallback selector
- Cross-origin iframe: visible limitation, no bypass
- Storage: `chrome.storage.local` only (token, connectionId, gatewayBaseUrl) — never Gateway bearer
- Reconnect: exponential backoff, local selection draft retained in storage
- Domscribe: status stub (`unavailable`) for SLC-4

## Non-goals

- Agent tools / next-turn (SLC-3)
- Real Domscribe adapter (SLC-4)
- Design tab / screenshots (SLC-5)

## Tests

- Protocol: C-001..C-005 schema parse + new error codes
- Plugin T-004: pair / complete / revoke / deny + bridge selection → store (no send)
- Extension: inspect capture bounds + reconnect backoff unit tests
