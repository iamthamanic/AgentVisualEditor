# Compatibility

## OpenClaw host

| Declared range | Tested | Evidence |
|----------------|--------|----------|
| `peerDependencies.openclaw >=2026.9.4` | `2026.9.5` | `packages/openclaw-plugin/package.json`, T-026 `openclaw plugins build` + `validate --json` |

- Public SDK only: `openclaw/plugin-sdk/*` (INV-2).
- On incompatible host APIs, plugin activation must fail clearly — no partial native UI load (PRD §19).
- Custom Plugin UI host flag: `gateway.controlUi.experimental.customPlugins: true`.

## Browser

| Target | Status |
|--------|--------|
| Chrome MV3 | Supported (MVP) |
| Firefox | Out of scope MVP |

## Adapter boundary (FR-031)

`packages/core` and `packages/protocol` remain host-free so a future MCP adapter can reuse the same selection/change/screenshot model (SCN-024). Enforced by `npm run check:boundary`.

## Feature flags

| Flag | Default | Notes |
|------|---------|--------|
| `composerUiEnabled` | `true` | Requires Labs Custom Plugin UI |
| `testSelectionEnabled` | `false` | Debug Test-Selektion button |
| `previewEditingEnabled` | (extension) | Design-tab preview edits |
| `agentPreviewApplyEnabled` | `false` | C-015 write-preview; keep off until security suite green |
| `domscribeEnabled` | `true` | Auto; absence = degraded |
| `genericMcpEnabled` | later | `packages/mcp-adapter` placeholder only |
