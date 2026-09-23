/**
 * German UI labels for Domscribe / source-mapping status (FR-012, locale de).
 * Location: packages/domscribe-adapter/src/status-labels.ts
 */

import type { DomscribeUiStatus } from "./types.js";

export const DOMSCRIBE_STATUS_LABELS_DE: Record<DomscribeUiStatus, string> = {
  unavailable: "Quellzuordnung nicht verfügbar",
  available: "Quellzuordnung verfügbar",
  stale: "Quellzuordnung veraltet",
  error: "Quellzuordnung-Fehler",
};

export function statusLabelDe(status: DomscribeUiStatus): string {
  return DOMSCRIBE_STATUS_LABELS_DE[status];
}
