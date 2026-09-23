# AgentVisualEditor — agent notes

## Core invariants

1. **INV-1 Human-send:** Selection, chip attach/remove/clear, and preview edits never start an agent run or append a transcript message. Only explicit user Send does.
2. **INV-2 Native OpenClaw:** Use public `openclaw/plugin-sdk/*` only. No OpenClaw DOM injection from the extension; no private/internal imports.
3. **INV-3 Session binding fail-closed:** Exact `sessionKey` + `agentId`. No identity → `no_session_context`. Cross-session → `forbidden`. Never guess a target chat.
4. **INV-4 Least privilege:** Extension must not store an unrestricted Gateway bearer token. Plugin-scoped credentials only (SLC-2+).
5. **INV-5 Adapter boundary:** `packages/core` and `packages/protocol` must not depend on OpenClaw SDK types or Chrome APIs. Extension must not import OpenClaw SDK. Enforced by `npm run check:boundary` (FR-031 / SCN-024). `packages/mcp-adapter` stays a host-free placeholder until a generic MCP server is implemented.
6. **INV-6 Progressive context:** Useful chips work without Domscribe; Domscribe upgrades precision later (SLC-4).
7. **INV-7 Local-first:** No mandatory AgentVisualEditor cloud; no third-party telemetry by default.
8. **INV-8 Compatibility:** Pin/test OpenClaw host versions (`peerDependencies.openclaw >=2026.9.4`; tested `2026.9.5`).

## OpenClaw SDK facts (verified 2026.9.5)

- Feature plugins: `defineFeatureContract` + `defineFeaturePlugin` + `defineControlUiPlugin`.
- Composer replacement receives `draft`, `canSend`, `setDraft`, `send()`, optional `abort`.
- Prefer `context.mountDefault(container)` to compose the built-in composer under custom chip UI.
- Session-bound views receive exact `sessionKey` / `agentId`; carry both on feature invokes.
- Session extensions: `api.session.state.registerSessionExtension({ namespace, project, cleanup })` (grouped namespace; avoid deprecated flat aliases for new code).
- Custom plugin UI requires host `gateway.controlUi.experimental.customPlugins: true`.
- Build: `openclaw plugins build`; validate: `openclaw plugins validate --json`.

## Security checklist (secure-by-default)

- [ ] BR-001 / INV-1: no run on selection
- [ ] BR-003 / INV-3: fail-closed session binding
- [ ] BR-004: max 10 chips/draft
- [ ] BR-005: stable-identity dedup
- [ ] BR-006: no automatic chip migration across sessions
- [ ] BR-010: page content framed as untrusted; redaction for email / `sk-` / `ghp_` / `Bearer`
- [ ] NFR-006: selection ≤256KiB, DOM ≤100KiB, runtime ≤64KiB
- [ ] Zero type escape hatches (`any`, `as`, `@ts-ignore`, `@ts-expect-error`)

## Context compact & long queues

- Prefer short task scopes per SLC; do not implement later slices “while here”.
- Keep PRD citations (`FR-*`, `SCN-*`, `T-*`) in design/acceptance, not in runtime logs.
- For long queues: finish verify gates before starting the next issue.

## Docs & licenses

- Operator docs: `docs/setup.md`, `docs/runbook.md`, `docs/architecture.md`, `docs/compatibility.md`, `docs/privacy.md`
- MIT: `LICENSE` + `THIRD_PARTY_NOTICES.md` (T-028 / D-002 / D-003). Keep notices updated if Design Mode or Domscribe code is vendored.

## QA pipeline

1. Implement against `.qa/design/<slug>.md` and `.qa/acceptance/<slug>.md`
2. `npm run typecheck && npm run build && npm test`
3. `npm run check:boundary && npm run check:licenses`
4. `cd packages/openclaw-plugin && npm run build && npm run validate`
5. `@verify-ticket` / `@composition-gate` / typed-strict / security scan as configured in `.qa/project.yaml`
6. Do not push or open PRs unless explicitly requested
