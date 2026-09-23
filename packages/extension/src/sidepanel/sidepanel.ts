/**
 * Side panel UI: connection, inspect toggle, chat/Domscribe status (German).
 * Location: packages/extension/src/sidepanel/sidepanel.ts
 */

import type { BackgroundToUi, ConnectionState } from "../shared/types.js";

function requireHtml(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing element: ${id}`);
  }
  return el;
}

function requireInput(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${id}`);
  }
  return el;
}

function requireButton(id: string): HTMLButtonElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${id}`);
  }
  return el;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBackgroundStatus(value: unknown): value is BackgroundToUi {
  if (!isRecord(value)) {
    return false;
  }
  return value.type === "status" && typeof value.connection === "string";
}

function readStatusPayload(value: unknown): BackgroundToUi | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const status = value.status;
  return isBackgroundStatus(status) ? status : undefined;
}

const connection = requireHtml("connection");
const chat = requireHtml("chat");
const domscribe = requireHtml("domscribe");
const toggle = requireButton("inspectToggle");
const hint = requireHtml("selectionHint");
const error = requireHtml("error");
const gatewayInput = requireInput("gatewayUrl");
const codeInput = requireInput("pairingCode");
const pair = requireButton("pairBtn");
const disconnect = requireButton("disconnectBtn");

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  disconnected: "Getrennt",
  connecting: "Verbindet…",
  connected: "Verbunden",
  reconnecting: "Reconnect…",
  re_pair_required: "Erneut koppeln",
};

function render(status: BackgroundToUi): void {
  connection.textContent = CONNECTION_LABELS[status.connection];
  connection.dataset.state = status.connection;

  if (status.chat.status === "active" && status.chat.sessionKey) {
    chat.textContent = status.chat.title ?? status.chat.sessionKey.slice(0, 24);
  } else if (status.chat.status === "ambiguous") {
    chat.textContent = "Mehrere Chats — Auswahl unklar";
  } else {
    chat.textContent = "Kein aktiver Chat";
  }

  domscribe.textContent =
    status.domscribe === "unavailable"
      ? "Quellzuordnung nicht verfügbar"
      : status.domscribe === "available"
        ? "Quellzuordnung verfügbar"
        : status.domscribe === "stale"
          ? "Quellzuordnung veraltet"
          : "Quellzuordnung-Fehler";

  toggle.setAttribute("aria-pressed", status.inspectEnabled ? "true" : "false");
  toggle.textContent = status.inspectEnabled ? "AN" : "AUS";

  hint.textContent = status.lastSelectionId
    ? `Letzte Selektion: ${status.lastSelectionId}`
    : "Kein Element ausgewählt";

  if (status.lastError) {
    error.hidden = false;
    error.textContent = status.lastError;
  } else {
    error.hidden = true;
    error.textContent = "";
  }
}

async function refresh(): Promise<void> {
  const status: unknown = await chrome.runtime.sendMessage({ type: "get_status" });
  if (isBackgroundStatus(status)) {
    render(status);
  }
}

toggle.addEventListener("click", async () => {
  const enabled = toggle.getAttribute("aria-pressed") !== "true";
  const result: unknown = await chrome.runtime.sendMessage({
    type: "set_inspect",
    enabled,
  });
  const status = readStatusPayload(result);
  if (status) {
    render(status);
  }
});

pair.addEventListener("click", async () => {
  error.hidden = true;
  const result: unknown = await chrome.runtime.sendMessage({
    type: "pair",
    code: codeInput.value,
    gatewayBaseUrl: gatewayInput.value.trim() || "http://127.0.0.1:18789",
  });
  const status = readStatusPayload(result);
  if (status) {
    render(status);
  }
  if (isRecord(result) && result.ok === false && typeof result.message === "string") {
    error.hidden = false;
    error.textContent = result.message;
  }
});

disconnect.addEventListener("click", async () => {
  const result: unknown = await chrome.runtime.sendMessage({ type: "disconnect" });
  const status = readStatusPayload(result);
  if (status) {
    render(status);
  }
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isBackgroundStatus(message)) {
    render(message);
  }
});

gatewayInput.value = "http://127.0.0.1:18789";
void refresh();
