# Composition Gate — icons-i18n-install-docs

- HEAD_SHA: 61c9f96432605c23dc62e425edeb101b08f7fd83
- Date: 2026-09-24
- Verdict: CLEAR

## Event

User changes side-panel UI language (DE/EN) or loads static extension icons / install docs. No agent run and no bridge chip mutation from language change (INV-1).

## Hop chain

Side panel language select → `chrome.storage.local` → re-render local labels only.
OpenClaw Control UI strings resolve from browser locale at mount (no cross-session write).
Icons/docs: static assets / documentation only.

## Simulations

| Case | Intended | Composed | Result |
|------|----------|----------|--------|
| 1 event, N actors | Language change affects only this extension UI | Storage key `aveUiLocale` local to extension instance | pass |
| invalid / missing | Unknown locale falls back to browser/`en` | `resolveUiLocale` + select constrained to de\|en | pass |
| 2 consumers / crash | Language does not alter selection/chip/session binding | No bridge message on locale change | pass |

## Flags

| Tag | Severity | Hops | Why local review missed it | Fix |
|-----|----------|------|----------------------------|-----|
| none | — | — | — | — |

## Skip reason

n/a (UI preference is single-consumer local; documented CLEAR)
