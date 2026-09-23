/**
 * Side panel UI: Inspect / Design / Changes / Screenshots / Connection (German).
 * Location: packages/extension/src/sidepanel/sidepanel.ts
 *
 * Preview edits never Send (INV-1). Design gated by previewEditingEnabled.
 */

import { PreviewChangeTracker } from "../editor/change-tracker.js";
import type { BackgroundToUi, ConnectionState, VisualChangePayload } from "../shared/types.js";

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
const designSelection = requireHtml("designSelection");
const designFields = requireHtml("designFields");
const stylePadding = requireInput("stylePadding");
const styleRadius = requireInput("styleRadius");
const styleBg = requireInput("styleBg");
const styleColor = requireInput("styleColor");
const styleFontSize = requireInput("styleFontSize");
const styleText = requireInput("styleText");
const styleComment = requireInput("styleComment");
const applyDesignBtn = requireButton("applyDesignBtn");
const undoBtn = requireButton("undoBtn");
const redoBtn = requireButton("redoBtn");
const clearAllBtn = requireButton("clearAllBtn");
const changeList = requireHtml("changeList");
const changesEmpty = requireHtml("changesEmpty");
const shotViewportBtn = requireButton("shotViewportBtn");
const shotElementBtn = requireButton("shotElementBtn");
const shotHint = requireHtml("shotHint");

const tracker = new PreviewChangeTracker();
let currentStatus: BackgroundToUi | null = null;

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  disconnected: "Getrennt",
  connecting: "Verbindet…",
  connected: "Verbunden",
  reconnecting: "Reconnect…",
  re_pair_required: "Erneut koppeln",
};

function switchTab(tab: string): void {
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>(".ave-tab"))) {
    const selected = btn.dataset.tab === tab;
    btn.setAttribute("aria-selected", selected ? "true" : "false");
  }
  for (const panel of Array.from(document.querySelectorAll<HTMLElement>(".ave-panel"))) {
    panel.hidden = panel.dataset.panel !== tab;
  }
}

function renderChanges(): void {
  const items = tracker.list();
  changeList.textContent = "";
  changesEmpty.hidden = items.length > 0;
  for (const change of items) {
    const li = document.createElement("li");
    li.className = "ave-change-item";
    const label = document.createElement("span");
    const prop = change.property ?? change.kind;
    label.textContent = `${change.kind}:${prop} ${change.oldValue ?? "∅"} → ${change.newValue ?? "∅"} [${change.status}]`;
    li.appendChild(label);
    if (change.status === "pending") {
      const revertBtn = document.createElement("button");
      revertBtn.type = "button";
      revertBtn.className = "ave-secondary";
      revertBtn.textContent = "Revert";
      revertBtn.addEventListener("click", () => {
        void revertOne(change.id);
      });
      li.appendChild(revertBtn);
    }
    changeList.appendChild(li);
  }
  undoBtn.disabled = !tracker.canUndo();
  redoBtn.disabled = !tracker.canRedo();
}

function render(status: BackgroundToUi): void {
  currentStatus = status;
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

  const hasSelection = Boolean(status.lastSelectionId && status.lastSelector);
  designSelection.textContent = hasSelection
    ? `Selektion ${status.lastSelectionId}`
    : "Zuerst ein Element auswählen";
  if (designFields instanceof HTMLFieldSetElement) {
    designFields.disabled = !status.previewEditingEnabled || !hasSelection;
  }
  document.getElementById("tab-design")?.toggleAttribute("hidden", !status.previewEditingEnabled);

  if (status.lastArtifactId) {
    shotHint.textContent = `Letztes Artifact: ${status.lastArtifactId}`;
  }

  if (status.lastError) {
    error.hidden = false;
    error.textContent = status.lastError;
  } else {
    error.hidden = true;
    error.textContent = "";
  }

  renderChanges();
}

async function refresh(): Promise<void> {
  const status: unknown = await chrome.runtime.sendMessage({ type: "get_status" });
  if (isBackgroundStatus(status)) {
    render(status);
  }
}

function toPayload(change: ReturnType<PreviewChangeTracker["list"]>[number]): VisualChangePayload {
  const payload: VisualChangePayload = {
    id: change.id,
    kind: change.kind,
    status: change.status === "reverted" ? "reverted" : "pending",
  };
  if (change.property !== undefined) payload.property = change.property;
  if (change.path !== undefined) payload.path = change.path;
  if (change.oldValue !== undefined) payload.oldValue = change.oldValue;
  if (change.newValue !== undefined) payload.newValue = change.newValue;
  return payload;
}

async function applyDesign(): Promise<void> {
  const status = currentStatus;
  if (!status?.lastSelectionId || !status.lastSelector) {
    return;
  }
  const selectionId = status.lastSelectionId;
  const selector = status.lastSelector;

  const styleJobs: Array<{ property: string; value: string }> = [];
  if (stylePadding.value.trim()) styleJobs.push({ property: "padding", value: stylePadding.value.trim() });
  if (styleRadius.value.trim()) styleJobs.push({ property: "border-radius", value: styleRadius.value.trim() });
  if (styleBg.value.trim()) styleJobs.push({ property: "background-color", value: styleBg.value.trim() });
  if (styleColor.value.trim()) styleJobs.push({ property: "color", value: styleColor.value.trim() });
  if (styleFontSize.value.trim()) styleJobs.push({ property: "font-size", value: styleFontSize.value.trim() });

  for (const job of styleJobs) {
    const change = tracker.applyStyle(job.property, "", job.value);
    const result: unknown = await chrome.runtime.sendMessage({
      type: "preview_edit",
      selectionId,
      selector,
      change: toPayload(change),
      apply: { kind: "style", property: job.property, value: job.value },
    });
    if (
      isRecord(result) &&
      result.ok === true &&
      isRecord(result.change) &&
      typeof result.change.oldValue === "string"
    ) {
      tracker.setOldValue(change.id, result.change.oldValue);
    }
  }

  if (styleText.value.trim()) {
    const change = tracker.applyText("", styleText.value.trim());
    await chrome.runtime.sendMessage({
      type: "preview_edit",
      selectionId,
      selector,
      change: toPayload(change),
      apply: { kind: "text", value: styleText.value.trim() },
    });
  }

  if (styleComment.value.trim()) {
    const change = tracker.applyComment(styleComment.value.trim());
    await chrome.runtime.sendMessage({
      type: "preview_edit",
      selectionId,
      selector,
      change: toPayload(change),
      apply: { kind: "comment" },
    });
  }

  renderChanges();
}

async function revertOne(changeId: string): Promise<void> {
  const status = currentStatus;
  if (!status?.lastSelectionId || !status.lastSelector) return;
  const reverted = tracker.revert(changeId);
  if (!reverted) return;
  await chrome.runtime.sendMessage({
    type: "preview_revert",
    selectionId: status.lastSelectionId,
    selector: status.lastSelector,
    change: toPayload(reverted),
  });
  renderChanges();
}

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>(".ave-tab"))) {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab) switchTab(tab);
  });
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

applyDesignBtn.addEventListener("click", () => {
  void applyDesign();
});

undoBtn.addEventListener("click", async () => {
  const status = currentStatus;
  if (!status?.lastSelectionId || !status.lastSelector) return;
  const result = tracker.undo();
  if (!result) return;
  if (result.revert) {
    await chrome.runtime.sendMessage({
      type: "preview_revert",
      selectionId: status.lastSelectionId,
      selector: status.lastSelector,
      change: toPayload(result.revert),
    });
  } else if (result.apply) {
    const apply =
      result.apply.kind === "style" && result.apply.property && result.apply.newValue
        ? { kind: "style" as const, property: result.apply.property, value: result.apply.newValue }
        : result.apply.kind === "text" && result.apply.newValue
          ? { kind: "text" as const, value: result.apply.newValue }
          : { kind: "comment" as const };
    await chrome.runtime.sendMessage({
      type: "preview_edit",
      selectionId: status.lastSelectionId,
      selector: status.lastSelector,
      change: toPayload(result.apply),
      apply,
    });
  } else if (result.clear) {
    await chrome.runtime.sendMessage({
      type: "preview_clear",
      selectionId: status.lastSelectionId,
      selector: status.lastSelector,
      changes: result.clear.map(toPayload),
    });
  }
  renderChanges();
});

redoBtn.addEventListener("click", async () => {
  const status = currentStatus;
  if (!status?.lastSelectionId || !status.lastSelector) return;
  const result = tracker.redo();
  if (!result) return;
  if (result.apply) {
    const apply =
      result.apply.kind === "style" && result.apply.property && result.apply.newValue
        ? { kind: "style" as const, property: result.apply.property, value: result.apply.newValue }
        : result.apply.kind === "text" && result.apply.newValue
          ? { kind: "text" as const, value: result.apply.newValue }
          : { kind: "comment" as const };
    await chrome.runtime.sendMessage({
      type: "preview_edit",
      selectionId: status.lastSelectionId,
      selector: status.lastSelector,
      change: toPayload(result.apply),
      apply,
    });
  } else if (result.revert) {
    await chrome.runtime.sendMessage({
      type: "preview_revert",
      selectionId: status.lastSelectionId,
      selector: status.lastSelector,
      change: toPayload(result.revert),
    });
  } else if (result.clear) {
    await chrome.runtime.sendMessage({
      type: "preview_clear",
      selectionId: status.lastSelectionId,
      selector: status.lastSelector,
      changes: result.clear.map(toPayload),
    });
  }
  renderChanges();
});

clearAllBtn.addEventListener("click", async () => {
  const status = currentStatus;
  if (!status?.lastSelectionId || !status.lastSelector) return;
  const pending = tracker.clearAll();
  await chrome.runtime.sendMessage({
    type: "preview_clear",
    selectionId: status.lastSelectionId,
    selector: status.lastSelector,
    changes: pending.map(toPayload),
  });
  renderChanges();
});

shotViewportBtn.addEventListener("click", async () => {
  const status = currentStatus;
  if (!status?.lastSelectionId) {
    shotHint.textContent = "Zuerst eine Selektion anhängen";
    return;
  }
  const result: unknown = await chrome.runtime.sendMessage({
    type: "capture_screenshot",
    selectionId: status.lastSelectionId,
    kind: "viewport",
  });
  if (isRecord(result) && result.ok === false && typeof result.message === "string") {
    shotHint.textContent = result.message;
  } else {
    shotHint.textContent = "Viewport-Screenshot hochgeladen…";
  }
  await refresh();
});

shotElementBtn.addEventListener("click", async () => {
  const status = currentStatus;
  if (!status?.lastSelectionId) {
    shotHint.textContent = "Zuerst eine Selektion anhängen";
    return;
  }
  const result: unknown = await chrome.runtime.sendMessage({
    type: "capture_screenshot",
    selectionId: status.lastSelectionId,
    kind: "element",
  });
  if (isRecord(result) && result.ok === false && typeof result.message === "string") {
    shotHint.textContent = result.message;
  } else {
    shotHint.textContent = "Element-Screenshot hochgeladen…";
  }
  await refresh();
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

void refresh();
