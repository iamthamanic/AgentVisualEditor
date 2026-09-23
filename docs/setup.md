# Setup

Local-first install for AgentVisualEditor (plugin + Chrome extension). No AgentVisualEditor cloud is required (INV-7 / FR-030).

## Prerequisites

- Node.js ≥ 24 (tested with Node 26)
- OpenClaw host ≥ **2026.9.4** (validated against **2026.9.5**)
- Chrome (MV3) for the extension

```bash
export PATH="$HOME/.local/node26/bin:$PATH"
cd /path/to/AgentVisualEditor
npm install
npm run typecheck && npm run build && npm test
npm run check:boundary && npm run check:licenses
```

## Install OpenClaw plugin

```bash
cd packages/openclaw-plugin
npm run build
npm run validate
openclaw plugins install .
```

Enable **Settings → Labs → Custom plugin UI** (`gateway.controlUi.experimental.customPlugins: true`), then choose **AVE Composer mit Chips** under Plugins → Customize UI.

## Load Chrome extension

```bash
cd packages/extension
npm run build
```

In Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → select `packages/extension/dist-ext`.

## Pairing

1. In OpenClaw AgentVisualEditor settings/page, start pairing and copy the one-time code.
2. Open the extension side panel → Connection → paste code → connect.
3. Health should show plugin installed, Labs flag on, bridge reachable, extension paired, session available.
4. Domscribe status is **per page** — unavailable is degraded mode, not a connection failure (FR-029).

Revoke tokens from the plugin settings if a device is lost (runbook: pairing compromised).

## Health checklist (FR-028)

| Check | Where |
|-------|--------|
| Plugin installed / validated | `openclaw plugins validate --json` |
| Custom Plugin UI enabled | OpenClaw Labs |
| Bridge reachable | Extension Connection status |
| Extension paired | Side panel Connection |
| Current session available | Composer chips bind to exact `sessionKey`+`agentId` |
| Domscribe | Per-page status; degraded OK |

## Rollback

See [runbook.md](./runbook.md#plugin-upgrade-breaks-composer) — select Built-in composer anytime.
