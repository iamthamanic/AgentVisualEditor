# AgentVisualEditor — agent notes

## Core invariants

1. **INV-1 Human-send:** Selection, chip attach/remove/clear, and preview edits never start an agent run or append a transcript message. Only explicit user Send does.
2. **INV-2 Native OpenClaw:** Use public `openclaw/plugin-sdk/*` only. No OpenClaw DOM injection from the extension; no private/internal imports.
3. **INV-3 Session binding fail-closed:** Exact `sessionKey` + `agentId`. No identity → `no_session_context`. Cross-session → `forbidden`. Never guess a target chat.
4. **INV-4 Least privilege:** Extension must not store an unrestricted Gateway bearer token. Plugin-scoped credentials only (SLC-2+).
5. **INV-5 Adapter boundary:** `packages/core` and `packages/protocol` must not depend on OpenClaw SDK types.
6. **INV-6 Progressive context:** Useful chips work without Domscribe; Domscribe upgrades precision later (SLC-4).
7. **INV-7 Local-first:** No mandatory AgentVisualEditor cloud; no third-party telemetry by default.
8. **INV-8 Compatibility:** Pin/test OpenClaw host versions (`peerDependencies.openclaw >=2026.9.4`).

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

## QA pipeline

1. Implement against `.qa/design/<slug>.md` and `.qa/acceptance/<slug>.md`
2. `npm run typecheck && npm run build && npm test`
3. `cd packages/openclaw-plugin && npm run build && npm run validate`
4. `@verify-ticket` / `@composition-gate` / typed-strict / security scan as configured in `.qa/project.yaml`
5. Do not push or open PRs unless explicitly requested
