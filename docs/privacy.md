# Privacy

AgentVisualEditor is **local-first** (INV-7 / FR-030):

- No mandatory AgentVisualEditor cloud backend.
- No third-party product analytics/telemetry by default.
- Artifacts (screenshots, DOM snippets) stay on the operator’s OpenClaw host / local extension storage with size/TTL caps (NFR-006).

## Data handled

| Kind | Handling |
|------|----------|
| Page DOM / text / styles | Captured only for selected elements; size-capped; treated as untrusted |
| Screenshots | Local artifacts with timestamp/URL metadata |
| Pairing tokens | Plugin-scoped; revocable; not an unrestricted Gateway bearer (INV-4) |
| Session identity | Exact `sessionKey` + `agentId`; fail-closed (INV-3) |

## Redaction

Captured text/runtime fields apply redaction patterns for emails and secret-like tokens (`sk-`, `ghp_`, `Bearer`, …). Do not log raw sensitive fields (BR-010 / NFR-005).

## Extension permissions

Chrome permissions are minimized to what Inspect / side panel / capture require (NFR-004 / RISK-006). Site access may be optional/activeTab-style where possible; revoked site permission disables Inspect with a clear remediation message.
