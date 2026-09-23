# Feature: SLC-5: Visual Editing (Design-Tab, Undo, Screenshots)

<!-- refined by /implement on 2026-09-24 from issue #5 + .qa/design/slc-5.md -->

## Intent

Visual Editing (PRD §19 SLC-5): Design-Tab in der Extension für transiente CSS-/Text-Preview-Edits am selektierten Element (sizing, spacing, border radius, color/background, typography, unterstützte Layout-Properties), mit old/new-Werten, undo, redo, per-change revert und clear-all (FR-014..FR-017), plus Viewport- und Element-Screenshots als bounded Artifacts, referenz by selectionId statt unbounded im Session-State (FR-018). Previews sind strikt temporärer Browser-State und klar gelabelt (BR-008). Feature-Flag: `previewEditingEnabled`.

## Preconditions

- SLC-1..4 on branch (chips, bridge, send tools, Domscribe degraded path)
- C-008 `selection.update` + C-009 schema already in protocol; C-009 was `forbidden` stub
- `VisualChange` in core; selection.update merges changes into store

## Happy Path

- [ ] Given a selection and Design tab, when user edits allowlisted style/text, then page shows preview, VisualChange has old/new, labeled uncommitted (SCN-010 / FR-014 / FR-015 / BR-008)
- [ ] Given pending changes, when undo / redo / per-change revert / clear-all, then DOM and change list return to prior/original (FR-016)
- [ ] Given a selection, when viewport or element screenshot is captured ≤ 2 MiB, then C-009 stores Artifact by selectionId with TTL; get_screenshot returns it; after page mutation artifact stays timestamped (SCN-017 / T-019 / FR-018 / EDGE-013)
- [ ] Given `previewEditingEnabled: false`, when Design/C-009/change update attempted, then forbidden/disabled; Inspect still works
- [ ] Keyboard shortcuts do not tear down inspect/design while focus is in page inputs (FR-032 / T-023 / EDGE-017)
- [ ] INV-1: preview edit, comment, screenshot never start an agent run / Send
- [ ] Touched files: zero type escape hatches (typed-strict)

## Edge Cases

- [ ] EDGE-011: oversized PNG → `too_large`, no crash
- [ ] EDGE-013: page mutation after capture → historical artifact retained
- [ ] Comment pinned to selectionId (not live DOM node) after mutation
- [ ] Invalid CSS value rejected locally before apply
- [ ] C-009 requestId + contentHash dedupe

## Regression

- [ ] SLC-1..4 tests remain green
- [ ] `npm run typecheck && npm run build && npm test` + plugin validate green

## Assumptions

- C-009 v1 transports PNG as `pngBase64` inside the JSON envelope (WSS maxPayload raised); binary frames remain unused
- Extension Design UI uses German labels; preview banner: „Vorschau — nicht committed“
- Artifact TTL default 2h (A-004)

## Screenshots

| Step | Filename |
|------|----------|
| 1 | `01-n/a-headless.png` |

## Security Coverage

- BR-001 / INV-1: preview/comment/screenshot never send
- BR-008: previews labeled temporary / uncommitted
- BR-010: comments/page content treated as untrusted data; redaction on admit path retained
- NFR-006: screenshot ≤ 2 MiB; selection JSON caps unchanged
- INV-3: C-008/C-009 still require exact active session
- INV-4: scoped extension token only
- F-03/B-01: no new public auth; artifact store is in-process + TTL

## Composition Gate

- HEAD_SHA: pending
- Verdict: pending
- Proof: `.qa/runs/composition-gate-slc-5-visual-editing.md`
- Skip reason: n/a

## Implementation Notes

- Files: `.qa/design/slc-5.md`; `packages/core` (VisualChange helpers, screenshot limits, `comment` kind); `packages/protocol` (C-009 `pngBase64` + artifact ack); `packages/openclaw-plugin` (`ArtifactStore`, C-009 handler, `previewEditingEnabled`, `get_screenshot`); `packages/extension` (Design/Changes/Screenshots tabs, PreviewChangeTracker, content preview apply/revert, keyboard guard, screenshot capture→upload)
- Tests: core `visual-change.test.ts`; extension `preview-editing.test.ts` (undo/redo/revert/clear + size cap + keyboard); plugin `t019-artifact-preview.test.ts` (upload/TTL/dedupe/too_large/flag/INV-1)
- Known limitations: element screenshot currently uploads viewport capture tagged `kind: "element"` (crop deferred); C-009 v1 uses JSON `pngBase64` (WSS maxPayload 3 MiB)
- Validation: `npm run typecheck && npm run build && npm test` + `cd packages/openclaw-plugin && npm run validate` green
- No commit — working tree left for `@verify-ticket` / composition-gate
