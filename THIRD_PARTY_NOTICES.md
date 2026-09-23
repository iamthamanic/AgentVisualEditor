# Third-party notices

AgentVisualEditor is MIT-licensed (see [LICENSE](./LICENSE)). This file satisfies **T-028** / release criterion §18.8 and tracks Design Mode / Domscribe attribution commitments (**D-002**, **D-003**, **RISK-008**).

## Design Mode (browser visual-editor concepts)

| Field | Value |
|-------|--------|
| Project | Design Mode (browser extension / visual CSS editing patterns) |
| License | MIT |
| PRD refs | S-007, D-002, RISK-008 |
| Scope in this repo | Conceptual reuse of inspect / side-panel / preview-edit UX patterns. MVP packages under `packages/extension` are original TypeScript; no verbatim Design Mode source tree is vendored today. |
| Obligation | If Design Mode source is later forked or copied, retain upstream MIT copyright/license headers and update this notice with upstream commit/URL and the reused path list. |

## Domscribe (DOM → source mapping)

| Field | Value |
|-------|--------|
| Project | Domscribe (`data-ds` instrumentation + relay) |
| License | MIT |
| PRD refs | S-008, D-003 |
| Scope in this repo | Adapter-only consumption via `packages/domscribe-adapter` (`SourceResolver`, HTTP relay lookup, fixtures). No Domscribe compiler/runtime is vendored. |
| Obligation | Preserve MIT notices for any future vendored Domscribe assets; keep the hard adapter boundary (core never imports Domscribe packages). |

## OpenClaw (host peer)

| Field | Value |
|-------|--------|
| Project | OpenClaw |
| Role | Peer host (`peerDependencies.openclaw >=2026.9.4`); public `openclaw/plugin-sdk/*` only in `packages/openclaw-plugin` |
| Note | Not redistributed as source in this monorepo; install separately. Compatibility: see [docs/compatibility.md](./docs/compatibility.md). |

## Runtime / build dependencies

Workspace `package-lock.json` pins transitive npm packages. Each package carries its own license metadata on npm. No additional proprietary assets are bundled in MVP release artifacts.
