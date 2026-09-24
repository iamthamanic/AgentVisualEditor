/**
 * Control-UI strings (DE/EN). Follows browser/OpenClaw UI language.
 * Side-panel language is controlled separately in the Chrome extension.
 * Location: packages/openclaw-plugin/src/ui-i18n.ts
 */

export type UiLocale = "de" | "en";

export type ControlUiStrings = {
  navLabel: string;
  pageLabel: string;
  heading: string;
  loadingStatus: string;
  hintNoAgentRun: string;
  pairingTitle: string;
  pairingCodeNone: string;
  pairingStart: string;
  pairedExtensionsAria: string;
  revoke: string;
  chromeExtensionLabel: string;
  codeValidUntil: (code: string, expiresAt: string) => string;
  healthLine: (input: {
    bridgePath: string;
    session: string;
    domscribe: string;
    paired: number;
  }) => string;
  domscribeAvailable: string;
  domscribeStale: string;
  domscribeError: string;
  domscribeUnavailable: string;
  composerLabel: string;
  chipsAria: string;
  clearAll: string;
  send: string;
  sendTitle: string;
  testSelection: string;
  removeSelectionAria: (label: string) => string;
  sendNotPossible: string;
  sendRejected: string;
  selectionUpdated: string;
  testSelectionAdded: string;
};

const de: ControlUiStrings = {
  navLabel: "AVE Status",
  pageLabel: "AVE Status",
  heading: "Agent Visual Editor",
  loadingStatus: "Lade Status…",
  hintNoAgentRun:
    "Selektion startet keinen Agent-Lauf. Nur explizites Senden löst eine Nachricht aus.",
  pairingTitle: "Extension koppeln",
  pairingCodeNone: "Noch kein Code erzeugt",
  pairingStart: "Pairing-Code erzeugen",
  pairedExtensionsAria: "Gekoppelte Extensions",
  revoke: "Widerrufen",
  chromeExtensionLabel: "Chrome Extension",
  codeValidUntil: (code, expiresAt) => `${code} (gültig bis ${expiresAt})`,
  healthLine: ({ bridgePath, session, domscribe, paired }) =>
    `Plugin aktiv · Bridge ${bridgePath} · Session: ${session} · Domscribe: ${domscribe} · Verbindungen: ${paired}`,
  domscribeAvailable: "Quellzuordnung verfügbar",
  domscribeStale: "Quellzuordnung veraltet",
  domscribeError: "Quellzuordnung-Fehler",
  domscribeUnavailable: "Quellzuordnung nicht verfügbar",
  composerLabel: "AVE Composer mit Chips",
  chipsAria: "Visuelle Selektionen",
  clearAll: "Alle entfernen",
  send: "Senden",
  sendTitle:
    "Sendet die Nachricht und übergibt den Visual-Kontext an den nächsten Agent-Turn",
  testSelection: "Test-Selektion",
  removeSelectionAria: (label) => `Selektion entfernen: ${label}`,
  sendNotPossible: "Senden gerade nicht möglich",
  sendRejected: "Senden abgelehnt — Entwurf und Chips bleiben erhalten",
  selectionUpdated: "Selektion aktualisiert",
  testSelectionAdded: "Test-Selektion hinzugefügt",
};

const en: ControlUiStrings = {
  navLabel: "AVE Status",
  pageLabel: "AVE Status",
  heading: "Agent Visual Editor",
  loadingStatus: "Loading status…",
  hintNoAgentRun:
    "Selection never starts an agent run. Only explicit Send posts a message.",
  pairingTitle: "Pair extension",
  pairingCodeNone: "No code generated yet",
  pairingStart: "Generate pairing code",
  pairedExtensionsAria: "Paired extensions",
  revoke: "Revoke",
  chromeExtensionLabel: "Chrome Extension",
  codeValidUntil: (code, expiresAt) => `${code} (valid until ${expiresAt})`,
  healthLine: ({ bridgePath, session, domscribe, paired }) =>
    `Plugin active · Bridge ${bridgePath} · Session: ${session} · Domscribe: ${domscribe} · Connections: ${paired}`,
  domscribeAvailable: "Source mapping available",
  domscribeStale: "Source mapping stale",
  domscribeError: "Source mapping error",
  domscribeUnavailable: "Source mapping unavailable",
  composerLabel: "AVE Composer with chips",
  chipsAria: "Visual selections",
  clearAll: "Clear all",
  send: "Send",
  sendTitle: "Sends the message and attaches visual context for the next agent turn",
  testSelection: "Test selection",
  removeSelectionAria: (label) => `Remove selection: ${label}`,
  sendNotPossible: "Send is not available right now",
  sendRejected: "Send rejected — draft and chips were kept",
  selectionUpdated: "Selection updated",
  testSelectionAdded: "Test selection added",
};

export function resolveUiLocale(raw?: string): UiLocale {
  const value = (raw ?? (typeof navigator !== "undefined" ? navigator.language : "en")).toLowerCase();
  return value.startsWith("de") ? "de" : "en";
}

export function controlUiStrings(locale?: UiLocale | string): ControlUiStrings {
  const resolved =
    locale === "de" || locale === "en" ? locale : resolveUiLocale(locale);
  return resolved === "de" ? de : en;
}
