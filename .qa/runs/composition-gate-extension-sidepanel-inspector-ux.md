# Composition Gate — extension-sidepanel-inspector-ux

- HEAD_SHA: a7684d624f9854eff11b0a54c5b32f6a25bf801a
- Date: 2026-09-24
- Verdict: CLEAR

## Event

User selects a page element in Inspect Mode; extension stores a local selection summary and optionally uploads a selection chip to OpenClaw when connected. Element preview is a local screenshot crop that never starts an agent run (INV-1).

## Hop chain

Content `selection_captured` → service-worker local `lastSelection` (+ optional bridge `selection.create`) → side panel status render → optional `captureVisibleTab` queue → `selection_preview_frame` → side-panel crop → `selection_preview_result` → UI preview image.

Pairing: side panel `pair` → plugin `pairing.complete` → status `connected` (session still fail-closed for chips).

## Simulations

| Case | Intended | Composed | Result |
|------|----------|----------|--------|
| 1 event, N actors | One selection updates one `lastSelection`; newer click replaces preview job | `previewJobLatest` keeps only latest job; local id until bridge result | pass |
| invalid / missing | No OpenClaw → local selection + preview still work; no chip sync | Bridge send gated on `connection === "connected"`; UI shows local footer | pass |
| 2 consumers / crash | Capture quota / permission failure does not corrupt selection metadata | Rate-limited queue + backoff; previewStatus failed with retry; selection rows remain | pass |

## Flags

| Tag | Severity | Hops | Why local review missed it | Fix |
|-----|----------|------|----------------------------|-----|
| none | — | — | — | — |

## Skip reason

n/a
