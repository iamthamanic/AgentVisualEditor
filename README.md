# AgentVisualEditor

OpenClaw feature plugin + Chrome MV3 extension for Cursor-like visual selection chips in chat.

Selection, chip attach/remove, and preview edits **never** start an agent run — only explicit **Send** does ([AGENTS.md](./AGENTS.md) INV-1).

**MVP (SLC-1..7):** native chips, secure bridge, send-context tools, optional Domscribe mapping, visual preview edits, closed-loop apply/resolve, and **adapter-boundary CI** so a future MCP adapter can reuse `core`/`protocol` (FR-031).

## Packages

| Package | Role |
|---------|------|
| `packages/core` | Agent-agnostic VisualSelection / VisualBatch domain |
| `packages/protocol` | Bridge message schemas, `PROTOCOL_VERSION=1` |
| `packages/openclaw-plugin` | OpenClaw feature plugin + Control UI chips + tools |
| `packages/extension` | Chrome MV3 Inspect / Design / bridge client |
| `packages/domscribe-adapter` | Domscribe `SourceResolver` (degraded when absent) |
| `packages/mcp-adapter` | Generic MCP adapter **placeholder** (boundary ready) |

## Requirements

- Node.js ≥ 24 (tested with Node 26)
- OpenClaw ≥ **2026.9.4** (peer; validated against **2026.9.5**)
- Chrome for the unpacked extension

```bash
export PATH="$HOME/.local/node26/bin:$PATH"
npm install
npm run typecheck
npm run build
npm test
npm run check:boundary
npm run check:licenses
cd packages/openclaw-plugin && npm run build && npm run validate
```

## Setup / Health / Pairing

See **[docs/setup.md](./docs/setup.md)** for plugin install, Labs Custom Plugin UI, extension load, pairing, and the FR-028 health checklist.

Short path:

```bash
cd packages/openclaw-plugin && npm run build && openclaw plugins install .
cd ../extension && npm run build   # load packages/extension/dist-ext unpacked
```

Enable **Settings → Labs → Custom plugin UI**, then choose **AVE Composer mit Chips**.

## Feature flags

| Flag | Default | Meaning |
|------|---------|---------|
| `composerUiEnabled` | `true` | Composer chip UI (needs Labs flag) |
| `testSelectionEnabled` | `false` | Debug **Test-Selektion** |
| `agentPreviewApplyEnabled` | `false` | Agent `apply_preview` (C-015) |
| `domscribeEnabled` | `true` | Source mapping; absence = degraded |

Full matrix: [docs/compatibility.md](./docs/compatibility.md).

## Rollback

If the plugin UI misbehaves, switch OpenClaw customization back to the **Built-in** composer — chat stays usable (NFR-015). Ops detail: [docs/runbook.md](./docs/runbook.md).

## Adapter boundary (FR-031)

`core` / `protocol` must not import OpenClaw or Chrome APIs; the extension must not import the OpenClaw SDK. Enforced by `npm run check:boundary` (negative fixtures included). Design: [docs/architecture.md](./docs/architecture.md).

## License

MIT — [LICENSE](./LICENSE). Third-party / Design Mode / Domscribe notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Docs

- [docs/PRD.md](./docs/PRD.md)
- [docs/setup.md](./docs/setup.md)
- [docs/runbook.md](./docs/runbook.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/compatibility.md](./docs/compatibility.md)
- [docs/privacy.md](./docs/privacy.md)
- [`.qa/design/slc-7.md`](./.qa/design/slc-7.md)
- [`.qa/acceptance/slc-7-adapter-boundary-docs.md`](./.qa/acceptance/slc-7-adapter-boundary-docs.md)
