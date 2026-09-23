# AgentVisualEditor

OpenClaw feature plugin + browser extension monorepo for Cursor-like visual selection chips in chat.

**SLC-1 (this release):** native composer chips, session binding, no-send-on-selection. Extension bridge and agent tools come later.

## Packages

| Package | Role |
|---------|------|
| `packages/core` | Agent-agnostic VisualSelection / VisualBatch domain |
| `packages/protocol` | Bridge message schemas (C-006..C-009), `PROTOCOL_VERSION=1` |
| `packages/openclaw-plugin` | OpenClaw feature plugin + Control UI chips |
| `packages/extension` | Chrome MV3 extension (placeholder, SLC-2) |
| `packages/domscribe-adapter` | Domscribe adapter (placeholder, SLC-4) |
| `packages/mcp-adapter` | Generic MCP adapter (placeholder, SLC-7) |

## Requirements

- Node.js ≥ 24 (tested with Node 26)
- OpenClaw ≥ 2026.9.4 (peer; validated against 2026.9.5)

```bash
export PATH="$HOME/.local/node26/bin:$PATH"
npm install
npm run typecheck
npm run build
npm test
cd packages/openclaw-plugin && npm run build && npm run validate
```

## Install plugin locally

```bash
cd packages/openclaw-plugin
npm run build
openclaw plugins install .
```

Enable **Settings → Labs → Custom plugin UI**, then choose **AVE Composer mit Chips** under Plugins → Customize UI.

Config flags:

- `composerUiEnabled` (default `true`)
- `testSelectionEnabled` (default `false`) — shows the Debug **Test-Selektion** button

## Hard invariants

See [AGENTS.md](./AGENTS.md). Selection/chip ops never start an agent run — only explicit Send.

## Docs

- [docs/PRD.md](./docs/PRD.md)
- [`.qa/design/slc-1.md`](./.qa/design/slc-1.md)
- [`.qa/acceptance/slc-1-chat-binding-chips.md`](./.qa/acceptance/slc-1-chat-binding-chips.md)
