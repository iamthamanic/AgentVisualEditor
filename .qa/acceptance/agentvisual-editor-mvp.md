# Acceptance — AgentVisualEditor MVP

## SLC table

| Slice | Status | Notes |
|-------|--------|-------|
| SLC-1 Native chat binding + chips | in progress | Composer chips, session binding, no-send |
| SLC-2 Extension inspect + secure bridge | pending | |
| SLC-3 Send context + agent tools | pending | |
| SLC-4 Domscribe mapping | pending | |
| SLC-5 Visual editing | pending | |
| SLC-6 Closed-loop verification | pending | |
| SLC-7 Adapter boundary hardening | pending | |

## Invariants INV-1..6

| ID | Rule |
|----|------|
| INV-1 | Selection/chip ops never start an agent run or transcript message — only explicit Send |
| INV-2 | Native OpenClaw plugin SDK only; no OpenClaw DOM hacking from the extension |
| INV-3 | Session binding fail-closed (`sessionKey` + `agentId`) |
| INV-4 | No unrestricted Gateway bearer token in the extension |
| INV-5 | Core/protocol independent of OpenClaw SDK types |
| INV-6 | Useful without Domscribe; Domscribe is progressive precision |

See also INV-7/INV-8 in `AGENTS.md`.
