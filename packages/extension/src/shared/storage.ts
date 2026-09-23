/**
 * chrome.storage.local helpers — scoped token only (INV-4).
 * Location: packages/extension/src/shared/storage.ts
 */

import type { CapturedSelection, PairingConfig } from "./types.js";

const KEYS = {
  pairing: "ave.pairing",
  localSelections: "ave.localSelections",
  extensionInstanceId: "ave.extensionInstanceId",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function loadPairing(): Promise<PairingConfig | null> {
  const result = await chrome.storage.local.get(KEYS.pairing);
  const value = result[KEYS.pairing];
  if (!isPairingConfig(value)) {
    return null;
  }
  return value;
}

export async function savePairing(config: PairingConfig): Promise<void> {
  await chrome.storage.local.set({ [KEYS.pairing]: config });
}

export async function clearPairing(): Promise<void> {
  await chrome.storage.local.remove(KEYS.pairing);
}

export async function loadLocalSelections(): Promise<CapturedSelection[]> {
  const result = await chrome.storage.local.get(KEYS.localSelections);
  const value = result[KEYS.localSelections];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isCapturedSelection);
}

export async function saveLocalSelections(selections: CapturedSelection[]): Promise<void> {
  // Cap local queue to 10 (matches chip limit).
  await chrome.storage.local.set({ [KEYS.localSelections]: selections.slice(-10) });
}

export async function getOrCreateExtensionInstanceId(): Promise<string> {
  const result = await chrome.storage.local.get(KEYS.extensionInstanceId);
  const existing = result[KEYS.extensionInstanceId];
  if (typeof existing === "string" && existing.length > 0) {
    return existing;
  }
  const id = `ext_${crypto.randomUUID().replace(/-/g, "")}`;
  await chrome.storage.local.set({ [KEYS.extensionInstanceId]: id });
  return id;
}

function isPairingConfig(value: unknown): value is PairingConfig {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.gatewayBaseUrl === "string" &&
    typeof value.connectionId === "string" &&
    typeof value.token === "string" &&
    typeof value.extensionInstanceId === "string" &&
    value.token.startsWith("ave_")
  );
}

function isCapturedSelection(value: unknown): value is CapturedSelection {
  if (!isRecord(value)) {
    return false;
  }
  if (!isRecord(value.page) || !isRecord(value.element)) {
    return false;
  }
  return (
    typeof value.page.url === "string" &&
    typeof value.element.tag === "string" &&
    typeof value.element.selector === "string"
  );
}
