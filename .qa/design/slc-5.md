# SLC-5 design — Visual Editing (Design-Tab, Undo, Screenshots)

## Goal

User can preview CSS/text on a selected element in the extension Design tab, track old/new diffs with undo/redo/per-change revert/clear-all (FR-014..FR-016), pin comments (FR-017), and capture bounded viewport/element screenshots referenced by `selectionId` via C-009 (FR-018) — without ever auto-sending (INV-1 / BR-001 / BR-008).

## Architecture

```text
Side panel Design / Changes / Screenshots
        │
        ├─ preview apply/revert ──► content script (transient DOM only)
        ├─ selection.update (C-008) ──► VisualBatchStore.changes[]
        └─ artifact.upload (C-009) ──► ArtifactStore (PNG + TTL)
                                              │
                                              ▼
                                   get_screenshot tool (C-014)
```

## Boundaries

- Preview overrides are browser-only; labeled uncommitted (BR-008). No arbitrary JS eval.
- `packages/core` / `protocol` stay OpenClaw-free (INV-5).
- Screenshots never land unbounded in session-extension JSON — ArtifactStore by id (D-007).
- Feature flag `previewEditingEnabled` (default true): when false, Design tab / C-009 / change updates disabled; Inspect remains.

## VisualChange

- Kinds: `style` | `text` | `attribute` | `comment` | `other`
- Status: `pending` → `reverted` (SLC-5); `resolved` reserved for SLC-6
- Tracker (extension): undo / redo / revert(id) / clearAll; apply never calls Send

## C-009 artifact.upload

- Metadata + `pngBase64` body (v1 JSON transport); hard cap 2 MiB decoded
- Dedupe: `requestId` (handler) + `contentHash`+`selectionId` (store)
- TTL ~2h (A-004); EDGE-013: `capturedAt` + `pageUrl` remain after page mutation
- Oversized → `too_large` (EDGE-011)

## Allowed style properties (controlled)

sizing, spacing, border/radius, color/background, typography, display/flex/grid basics when applicable. Invalid CSS rejected before apply.

## Keyboard (FR-032 / T-023)

Inspect Escape and Design shortcuts skip when focus is in input / textarea / contenteditable.

## Tests

- Extension: change-tracker undo/redo/revert/clear + screenshot size cap
- Plugin: C-009 upload / dedupe / too_large / TTL; get_screenshot after upload
- INV-1: preview/update/upload never prepare/admit send

## Non-goals

- `apply_preview` / `mark_resolved` (SLC-6)
- Send-context changes (SLC-3)
- Domscribe mapping (SLC-4)
- Persistent stylesheet / source writes

## Ready for /implement

YES
