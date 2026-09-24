/**
 * Map technical errors to plain-language German + keep raw detail for debug.
 * Location: packages/extension/src/shared/user-errors.ts
 */

export type ExplainedError = {
  user: string;
  technical: string;
};

const RULES: Array<{ match: RegExp; user: string }> = [
  {
    match: /pairing\.complete failed schema validation/i,
    user:
      "Der Pairing-Code wurde nicht akzeptiert. Schreib den Code noch einmal ab (vollständig, ohne Leerzeichen) und versuche es erneut.",
  },
  {
    match: /pairing\.start failed schema validation/i,
    user: "Pairing konnte nicht gestartet werden. Bitte OpenClaw neu laden und erneut versuchen.",
  },
  {
    match: /Ungültiger Pairing-Code|invalid_code/i,
    user: "Dieser Code stimmt nicht. Hole in OpenClaw einen neuen Pairing-Code und gib ihn hier ein.",
  },
  {
    match: /abgelaufen|expired_code/i,
    user: "Der Code ist abgelaufen. Starte in OpenClaw ein neues Pairing und nutze den frischen Code.",
  },
  {
    match: /Zu viele|rate_limited/i,
    user: "Zu viele Versuche. Warte kurz und versuche es danach mit einem neuen Code erneut.",
  },
  {
    match: /Protokollversion|incompatible_protocol/i,
    user: "Extension und Gateway passen nicht zusammen. Aktualisiere OpenClaw-Plugin und Extension, dann erneut koppeln.",
  },
  {
    match: /Failed to fetch|NetworkError|Load failed|fetch/i,
    user: "Keine Verbindung zum Gateway. Prüfe die Gateway-URL und ob OpenClaw lokal läuft.",
  },
  {
    match: /Ungültige Pairing-Antwort/i,
    user: "Das Gateway hat eine unerwartete Antwort geschickt. Prüfe, ob das AgentVisualEditor-Plugin geladen ist.",
  },
  {
    match: /gateway|not allowed|http:\/\/|https:\/\//i,
    user: "Die Gateway-URL ist ungültig oder nicht erlaubt. Nutze z. B. http://127.0.0.1:18789",
  },
];

export function explainError(raw: string): ExplainedError {
  const technical = raw.trim() || "unknown_error";
  for (const rule of RULES) {
    if (rule.match.test(technical)) {
      return { user: rule.user, technical };
    }
  }
  return {
    user: "Koppeln hat nicht geklappt. Prüfe Code und Gateway-URL, dann erneut versuchen.",
    technical,
  };
}
