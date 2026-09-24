/**
 * Side-panel UI strings (DE/EN). Follows Chrome UI language.
 * Location: packages/extension/src/shared/ui-i18n.ts
 */

export type UiLocale = "de" | "en";

export type SidepanelStrings = {
  language: string;
  subtitle: string;
  openclaw: string;
  chat: string;
  domscribe: string;
  connection: string;
  visualInspector: string;
  design: string;
  changes: string;
  screenshots: string;
  gatewayUrl: string;
  pairingCode: string;
  pair: string;
  paired: string;
  pairing: string;
  disconnect: string;
  mode: string;
  on: string;
  off: string;
  selection: string;
  copy: string;
  element: string;
  text: string;
  selector: string;
  page: string;
  size: string;
  retryPreview: string;
  apply: string;
  undo: string;
  redo: string;
  clear: string;
  revert: string;
  captureViewport: string;
  captureElement: string;
  disconnected: string;
  connecting: string;
  connected: string;
  reconnecting: string;
  noActiveChat: string;
  ambiguousChat: string;
  domscribeAvailable: string;
  domscribeStale: string;
  domscribeError: string;
  domscribeUnavailable: string;
  detailDisconnected: string;
  detailConnecting: string;
  detailConnected: string;
  detailReconnecting: string;
  inspectHintOn: string;
  inspectHintOff: string;
  syncedChip: string;
  localSyncing: string;
  localNoOpenClaw: string;
  previewPending: string;
  previewFailed: string;
  previewUnavailable: string;
  previewCropping: string;
  needSelectionFirst: string;
  viewportUploaded: string;
  elementUploaded: string;
  pairFailed: string;
  pairNotConnected: string;
  lastArtifact: (id: string) => string;
  designFor: (tag: string) => string;
  designNone: string;
  pageLine: (title: string, url: string) => string;
  sizeLine: (w: number, h: number) => string;
  noneDash: string;
};

const de: SidepanelStrings = {
  language: "Sprache",
  subtitle: "Side Panel",
  openclaw: "OpenClaw",
  chat: "Chat",
  domscribe: "Domscribe",
  connection: "Verbindung",
  visualInspector: "Visual Inspector",
  design: "Design",
  changes: "Changes",
  screenshots: "Screenshots",
  gatewayUrl: "Gateway-URL",
  pairingCode: "Pairing-Code",
  pair: "Koppeln",
  paired: "Gekoppelt ✓",
  pairing: "Koppelt…",
  disconnect: "Trennen",
  mode: "Modus",
  on: "AN",
  off: "AUS",
  selection: "Selektion",
  copy: "Copy",
  element: "Element",
  text: "Text",
  selector: "Selektor",
  page: "Seite",
  size: "Größe",
  retryPreview: "Erneut versuchen",
  apply: "Übernehmen",
  undo: "Undo",
  redo: "Redo",
  clear: "Alles löschen",
  revert: "Revert",
  captureViewport: "Viewport",
  captureElement: "Element",
  disconnected: "Getrennt",
  connecting: "Verbindet…",
  connected: "Verbunden",
  reconnecting: "Reconnect…",
  noActiveChat: "Kein aktiver Chat",
  ambiguousChat: "Mehrere Chats — Auswahl unklar",
  domscribeAvailable: "Quellzuordnung verfügbar",
  domscribeStale: "Quellzuordnung veraltet",
  domscribeError: "Quellzuordnung-Fehler",
  domscribeUnavailable: "Quellzuordnung nicht verfügbar",
  detailDisconnected: "Nicht gekoppelt — Verbindung aufklappen und Pairing-Code eingeben.",
  detailConnecting: "Verbindung wird hergestellt…",
  detailConnected: "Gekoppelt — Bridge aktiv.",
  detailReconnecting: "Verbindung unterbrochen — versuche Reconnect…",
  inspectHintOn: "Inspector AN — Element auf der Seite anklicken.",
  inspectHintOff: "Kein Element ausgewählt — Inspector AN, dann Element auf der Seite anklicken.",
  syncedChip: "An OpenClaw gesendet (Chip).",
  localSyncing: "Lokal ausgewählt — Sync mit OpenClaw…",
  localNoOpenClaw: "Lokal ausgewählt — OpenClaw nicht verbunden (kein Chip).",
  previewPending: "Vorschau wird erzeugt…",
  previewFailed: "Vorschau fehlgeschlagen",
  previewUnavailable: "Vorschau nicht verfügbar",
  previewCropping: "Vorschau wird zugeschnitten…",
  needSelectionFirst: "Zuerst eine Selektion anhängen",
  viewportUploaded: "Viewport-Screenshot hochgeladen…",
  elementUploaded: "Element-Screenshot hochgeladen…",
  pairFailed: "Koppeln fehlgeschlagen.",
  pairNotConnected: "Koppeln fehlgeschlagen — Status nicht verbunden.",
  lastArtifact: (id) => `Letztes Artifact: ${id}`,
  designFor: (tag) => `Design für <${tag}>`,
  designNone: "Keine Selektion — zuerst Inspector.",
  pageLine: (title, url) => `${title} — ${url}`,
  sizeLine: (w, h) => `${w}×${h}px`,
  noneDash: "—",
};

const en: SidepanelStrings = {
  language: "Language",
  subtitle: "Side panel",
  openclaw: "OpenClaw",
  chat: "Chat",
  domscribe: "Domscribe",
  connection: "Connection",
  visualInspector: "Visual Inspector",
  design: "Design",
  changes: "Changes",
  screenshots: "Screenshots",
  gatewayUrl: "Gateway URL",
  pairingCode: "Pairing code",
  pair: "Pair",
  paired: "Paired ✓",
  pairing: "Pairing…",
  disconnect: "Disconnect",
  mode: "Mode",
  on: "ON",
  off: "OFF",
  selection: "Selection",
  copy: "Copy",
  element: "Element",
  text: "Text",
  selector: "Selector",
  page: "Page",
  size: "Size",
  retryPreview: "Try again",
  apply: "Apply",
  undo: "Undo",
  redo: "Redo",
  clear: "Clear all",
  revert: "Revert",
  captureViewport: "Viewport",
  captureElement: "Element",
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  noActiveChat: "No active chat",
  ambiguousChat: "Multiple chats — target unclear",
  domscribeAvailable: "Source mapping available",
  domscribeStale: "Source mapping stale",
  domscribeError: "Source mapping error",
  domscribeUnavailable: "Source mapping unavailable",
  detailDisconnected: "Not paired — expand Connection and enter a pairing code.",
  detailConnecting: "Connecting…",
  detailConnected: "Paired — bridge active.",
  detailReconnecting: "Connection interrupted — reconnecting…",
  inspectHintOn: "Inspector ON — click an element on the page.",
  inspectHintOff: "No element selected — turn Inspector ON, then click an element.",
  syncedChip: "Sent to OpenClaw (chip).",
  localSyncing: "Selected locally — syncing with OpenClaw…",
  localNoOpenClaw: "Selected locally — OpenClaw not connected (no chip).",
  previewPending: "Creating preview…",
  previewFailed: "Preview failed",
  previewUnavailable: "Preview unavailable",
  previewCropping: "Cropping preview…",
  needSelectionFirst: "Attach a selection first",
  viewportUploaded: "Viewport screenshot uploaded…",
  elementUploaded: "Element screenshot uploaded…",
  pairFailed: "Pairing failed.",
  pairNotConnected: "Pairing failed — status is not connected.",
  lastArtifact: (id) => `Last artifact: ${id}`,
  designFor: (tag) => `Design for <${tag}>`,
  designNone: "No selection — use Inspector first.",
  pageLine: (title, url) => `${title} — ${url}`,
  sizeLine: (w, h) => `${w}×${h}px`,
  noneDash: "—",
};

export function resolveUiLocale(raw?: string): UiLocale {
  const value = (raw ?? (typeof navigator !== "undefined" ? navigator.language : "en")).toLowerCase();
  return value.startsWith("de") ? "de" : "en";
}

const STORAGE_KEY = "aveUiLocale";

export async function loadStoredUiLocale(): Promise<UiLocale> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    if (raw === "de" || raw === "en") return raw;
  } catch {
    // ignore
  }
  return resolveUiLocale();
}

export async function saveUiLocale(locale: UiLocale): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: locale });
  } catch {
    // ignore
  }
}

export function sidepanelStrings(locale?: UiLocale | string): SidepanelStrings {
  const resolved =
    locale === "de" || locale === "en" ? locale : resolveUiLocale(locale);
  return resolved === "de" ? de : en;
}
