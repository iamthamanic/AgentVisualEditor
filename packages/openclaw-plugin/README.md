# Agent Visual Editor (OpenClaw plugin)

Native composer chips, session-bound visual context, and read-only agent tools.
Selection never sends — only explicit Send (INV-1).

```sh
npm install
npm run build
npm run validate
openclaw plugins install .
```

Enable **Settings → Labs → Custom plugin UI**, then select **AVE Composer mit Chips**.

## SLC-3 send context

- Chip-region **Senden** runs `prepare_send` → canonical `props.send()` → `send_outcome`.
- Admitted send enqueues compact next-turn context via `api.session.workflow.enqueueNextTurnInjection` and clears chips; tools read the archived batch.
- If the built-in `mountDefault` Send is used instead, `agent_turn_prepare` injects the same compact context only when the host actually starts the turn (rejected sends never leak).
- Agent tools: `agent_visual_editor.get_active_context`, `get_selection`, `get_screenshot` (screenshot stub until SLC-5).
