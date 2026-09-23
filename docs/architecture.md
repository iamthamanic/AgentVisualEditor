# Architecture

AgentVisualEditor is an OpenClaw feature plugin + Chrome MV3 extension monorepo. Domain logic lives in adapter-neutral packages so a future generic MCP server can expose the same model without rewriting extension logic (**FR-031**, **SCN-024**, **INV-5**).

## Package boundaries

| Package | Role | Allowed deps |
|---------|------|----------------|
| `packages/core` | VisualSelection / VisualBatch / allowlists / redaction | stdlib only |
| `packages/protocol` | Bridge schemas, limits, `PROTOCOL_VERSION` | core + schema helpers (e.g. typebox) |
| `packages/domscribe-adapter` | `SourceResolver` (`data-ds` → SourceContext) | core |
| `packages/extension` | Inspect, Design tab, WSS bridge client | core, protocol, Chrome APIs |
| `packages/openclaw-plugin` | Feature contract, chips UI, tools, bridge hub | core, protocol, domscribe-adapter, `openclaw/plugin-sdk/*` |
| `packages/mcp-adapter` | Future MCP tools (placeholder) | core/protocol later; MVP exports status only |

### Hard rules (CI)

- `core` / `protocol` / `domscribe-adapter` / `mcp-adapter`: **no** `openclaw*` imports, **no** `chrome.*` / `browser.*` extension APIs.
- `extension`: **no** `openclaw*` imports (Chrome APIs OK).
- `openclaw-plugin`: only public plugin-sdk paths (INV-2).

Run: `npm run check:boundary` (`scripts/check-adapter-boundary.mjs`). Negative fixtures live under `scripts/fixtures/boundary-violations/`.

## Trust & credentials

- Page content is untrusted; redaction applies to email / `sk-` / `ghp_` / `Bearer` (BR-010).
- Extension must **not** store an unrestricted Gateway bearer token (INV-4) — plugin-scoped pairing only.
- Selection / chip / preview edits never start an agent run (INV-1).

## Composition

Prefer `context.mountDefault(container)` so the built-in composer remains under the chip region. User can always revert to Built-in composer if the plugin UI fails (NFR-015).

## Rollout order

local → single known host/profile → remote HTTPS → packaged artifacts → (later) generic MCP.
