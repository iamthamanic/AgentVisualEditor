/**
 * Side panel UI: stacked disclosures (Verbindung, Visual Inspector, Design, Changes, Screenshots).
 * Location: packages/extension/src/sidepanel/sidepanel.ts
 *
 * Preview edits never Send (INV-1). Design gated by previewEditingEnabled.
 */

import { PreviewChangeTracker } from "../editor/change-tracker.js";
import { cropElementPreviewInDom } from "../editor/element-preview.js";
import { explainError } from "../shared/user-errors.js";
import type {
  BackgroundToUi,
  ConnectionState,
  SelectionPreviewFrame,
  VisualChangePayload,
} from "../shared/types.js";

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

function isPreviewFrame(value: unknown): value is SelectionPreviewFrame {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.type === "selection_preview_frame" &&
    typeof value.selectionId === "string" &&
    typeof value.viewportDataUrl === "string" &&
    isRecord(value.box) &&
    typeof value.box.x === "number" &&
    typeof value.box.y === "number" &&
    typeof value.box.width === "number" &&
    typeof value.box.height === "number"
  );
}

function readStatusPayload(value: unknown): BackgroundToUi | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const status = value.status;
  return isBackgroundStatus(status) ? status : undefined;
}

const connection = requireHtml("connection");
const connectionDetail = requireHtml("connectionDetail");
const connDetails = requireHtml("connDetails");
const chat = requireHtml("chat");
const domscribe = requireHtml("domscribe");
const toggle = requireButton("inspectToggle");
const hint = requireHtml("selectionHint");
const selectionCard = requireHtml("selectionCard");
const selectionTag = requireHtml("selectionTag");
const selectionText = requireHtml("selectionText");
const selectionSelector = requireHtml("selectionSelector");
const selectionPage = requireHtml("selectionPage");
const selectionBox = requireHtml("selectionBox");
const selectionSync = requireHtml("selectionSync");
const selectionPreviewWrap = requireHtml("selectionPreviewWrap");
const selectionPreview = requireHtml("selectionPreview");
const selectionPreviewStatus = requireHtml("selectionPreviewStatus");
const copySelectionBtn = requireButton("copySelectionBtn");
const selectionPreviewRetry = requireButton("selectionPreviewRetry");
const error = requireHtml("error");
const pairBanner = requireHtml("pairBanner");
const gatewayInput = requireInput("gatewayUrl");
const codeInput = requireInput("pairingCode");
const pair = requireButton("pairBtn");
const pairLabel = pair.querySelector(".ave-btn-label");
const pairConfetti = requireHtml("pairConfetti");
const disconnect = requireButton("disconnectBtn");
const inspectDetails = requireHtml("inspectDetails");

function openConnectionPanel(): void {
  if (connDetails instanceof HTMLDetailsElement) {
    connDetails.open = true;
  }
}

function openInspectPanel(): void {
  if (inspectDetails instanceof HTMLDetailsElement) {
    inspectDetails.open = true;
  }
}
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
let pairCelebratePending = false;
let lastConnectionState: ConnectionState | null = null;

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  disconnected: "Getrennt",
  connecting: "Verbindet…",
  connected: "Verbunden",
  reconnecting: "Reconnect…",
  re_pair_required: "Erneut koppeln",
};

const CONNECTION_DETAILS: Record<ConnectionState, { text: string; tone: string }> = {
  disconnected: {
    text: "Nicht gekoppelt — Verbindung aufklappen und Pairing-Code eingeben.",
    tone: "muted",
  },
  connecting: {
    text: "Koppelt mit Gateway…",
    tone: "warn",
  },
  connected: {
    text: "Gekoppelt — OpenClaw empfängt Selektionen und Chips.",
    tone: "ok",
  },
  reconnecting: {
    text: "Verbindung unterbrochen — versuche Reconnect…",
    tone: "warn",
  },
  re_pair_required: {
    text: "Erneut koppeln nötig — Verbindung aufklappen und neuen Code eingeben.",
    tone: "warn",
  },
};

const CONFETTI_COLORS = ["#ffffff", "#ededed", "#a3a3a3", "#3dd68c", "#8a8a8a", "#c9a227"];

function setPairBanner(tone: "ok" | "error" | null, message: string): void {
  if (!tone) {
    pairBanner.hidden = true;
    pairBanner.replaceChildren();
    delete pairBanner.dataset.tone;
    return;
  }
  pairBanner.hidden = false;
  pairBanner.dataset.tone = tone;
  pairBanner.replaceChildren();

  if (tone === "ok") {
    const user = document.createElement("p");
    user.className = "ave-pair-banner__user";
    user.textContent = message;
    pairBanner.appendChild(user);
    return;
  }

  const explained = explainError(message);
  const user = document.createElement("p");
  user.className = "ave-pair-banner__user";
  user.textContent = explained.user;
  pairBanner.appendChild(user);

  const tech = document.createElement("p");
  tech.className = "ave-pair-banner__tech";
  tech.textContent = `Technik: ${explained.technical}`;
  pairBanner.appendChild(tech);
}

function setPairButtonPaired(paired: boolean): void {
  if (!(pairLabel instanceof HTMLElement)) {
    return;
  }
  if (paired) {
    pairLabel.textContent = "Gekoppelt ✓";
    pair.disabled = true;
    pair.classList.add("ave-btn--paired");
  } else {
    pairLabel.textContent = "Koppeln";
    pair.disabled = false;
    pair.classList.remove("ave-btn--paired");
  }
}

function burstConfetti(): void {
  pairConfetti.textContent = "";
  pairConfetti.classList.remove("is-burst");
  for (let i = 0; i < 18; i += 1) {
    const bit = document.createElement("span");
    const angle = (Math.PI * 2 * i) / 18 + (i % 3) * 0.2;
    const dist = 18 + (i % 5) * 6;
    bit.style.setProperty("--x", `${20 + (i * 7) % 60}%`);
    bit.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    bit.style.setProperty("--dy", `${Math.sin(angle) * dist - 12}px`);
    bit.style.setProperty("--rot", `${(i * 40) % 360}deg`);
    bit.style.setProperty("--d", `${(i % 6) * 35}ms`);
    bit.style.setProperty("--c", CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? "#ffffff");
    pairConfetti.appendChild(bit);
  }
  // Force reflow so the burst class restarts the animation.
  void pairConfetti.offsetWidth;
  pairConfetti.classList.add("is-burst");
  window.setTimeout(() => {
    pairConfetti.classList.remove("is-burst");
    pairConfetti.textContent = "";
  }, 900);
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

  const detail = CONNECTION_DETAILS[status.connection];
  connectionDetail.textContent = detail.text;
  connectionDetail.dataset.tone = detail.tone;

  if (status.connection === "disconnected" || status.connection === "re_pair_required") {
    const becameNeedsPair =
      lastConnectionState === null ||
      lastConnectionState === "connected" ||
      lastConnectionState === "connecting" ||
      lastConnectionState === "reconnecting" ||
      (status.connection === "re_pair_required" && lastConnectionState !== "re_pair_required");
    if (becameNeedsPair) {
      openConnectionPanel();
    }
  }
  lastConnectionState = status.connection;

  const paired = status.connection === "connected";
  if (paired && pairCelebratePending) {
    setPairButtonPaired(true);
    burstConfetti();
    setPairBanner("ok", "Gekoppelt — Verbindung steht.");
    pairCelebratePending = false;
  } else if (paired) {
    setPairButtonPaired(true);
  } else if (status.connection !== "connecting") {
    setPairButtonPaired(false);
  }

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

  const sel = status.lastSelection;
  if (sel) {
    selectionCard.hidden = false;
    hint.hidden = true;
    selectionTag.textContent = `<${sel.tag}>`;
    selectionText.textContent = sel.textSummary?.trim()
      ? sel.textSummary.length > 80
        ? `${sel.textSummary.slice(0, 80)}…`
        : sel.textSummary
      : "—";
    selectionSelector.textContent = sel.selector;
    selectionPage.textContent = sel.pageTitle
      ? `${sel.pageTitle} · ${sel.pageUrl}`
      : sel.pageUrl;
    selectionBox.textContent = sel.box
      ? `${sel.box.width}×${sel.box.height}px`
      : "—";
    selectionSync.textContent = sel.synced
      ? "An OpenClaw gesendet (Chip)."
      : status.connection === "connected"
        ? "Lokal ausgewählt — Sync mit OpenClaw…"
        : "Lokal ausgewählt — OpenClaw nicht verbunden (kein Chip).";

    selectionPreviewRetry.hidden = sel.previewStatus !== "failed";
    if (sel.previewStatus === "ready" && sel.previewDataUrl && selectionPreview instanceof HTMLImageElement) {
      selectionPreviewWrap.hidden = false;
      selectionPreviewStatus.hidden = true;
      selectionPreview.hidden = false;
      if (selectionPreview.src !== sel.previewDataUrl) {
        selectionPreview.src = sel.previewDataUrl;
      }
    } else if (sel.previewStatus === "pending") {
      selectionPreviewWrap.hidden = false;
      selectionPreview.hidden = true;
      selectionPreviewStatus.hidden = false;
      selectionPreviewStatus.textContent = sel.previewError?.trim()
        ? sel.previewError
        : "Vorschau wird erzeugt…";
      if (selectionPreview instanceof HTMLImageElement) {
        selectionPreview.removeAttribute("src");
      }
    } else if (sel.previewStatus === "failed") {
      selectionPreviewWrap.hidden = false;
      selectionPreview.hidden = true;
      selectionPreviewStatus.hidden = false;
      selectionPreviewStatus.textContent = sel.previewError
        ? `Vorschau fehlgeschlagen: ${sel.previewError}`
        : "Vorschau nicht verfügbar";
      if (selectionPreview instanceof HTMLImageElement) {
        selectionPreview.removeAttribute("src");
      }
    } else {
      selectionPreviewWrap.hidden = true;
      selectionPreviewStatus.hidden = true;
      if (selectionPreview instanceof HTMLImageElement) {
        selectionPreview.removeAttribute("src");
      }
    }
    openInspectPanel();
  } else {
    selectionCard.hidden = true;
    hint.hidden = false;
    selectionPreviewWrap.hidden = true;
    selectionPreviewStatus.hidden = true;
    hint.textContent = status.inspectEnabled
      ? "Inspector AN — Element auf der Seite anklicken."
      : "Kein Element ausgewählt — Inspector AN, dann Element auf der Seite anklicken.";
  }

  const hasSelection = Boolean(status.lastSelectionId && status.lastSelector);
  designSelection.textContent = hasSelection && sel
    ? `<${sel.tag}> · ${sel.selector}`
    : hasSelection
      ? `Selektion ${status.lastSelectionId}`
      : "Zuerst ein Element auswählen";
  if (designFields instanceof HTMLFieldSetElement) {
    designFields.disabled = !status.previewEditingEnabled || !hasSelection;
  }
  document.getElementById("designDetails")?.toggleAttribute("hidden", !status.previewEditingEnabled);

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

copySelectionBtn.addEventListener("click", async () => {
  const sel = currentStatus?.lastSelection;
  if (!sel) {
    return;
  }
  const lines = [
    `<${sel.tag}>`,
    sel.selector,
    sel.textSummary ? `text: ${sel.textSummary}` : undefined,
    sel.box ? `size: ${sel.box.width}×${sel.box.height}px` : undefined,
    sel.pageUrl,
  ].filter((line): line is string => typeof line === "string" && line.length > 0);
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    copySelectionBtn.dataset.copied = "true";
    copySelectionBtn.textContent = "Copied";
    window.setTimeout(() => {
      delete copySelectionBtn.dataset.copied;
      copySelectionBtn.textContent = "Copy";
    }, 1200);
  } catch {
    copySelectionBtn.textContent = "Fail";
    window.setTimeout(() => {
      copySelectionBtn.textContent = "Copy";
    }, 1200);
  }
});

selectionPreviewRetry.addEventListener("click", async () => {
  selectionPreviewRetry.hidden = true;
  const result: unknown = await chrome.runtime.sendMessage({ type: "selection_preview_retry" });
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
  setPairBanner(null, "");

  const code = codeInput.value.trim();
  if (code.length < 6) {
    pairCelebratePending = false;
    setPairButtonPaired(false);
    openConnectionPanel();
    setPairBanner(
      "error",
      "pairing.complete failed schema validation (code too short: enter the full code from OpenClaw)",
    );
    return;
  }

  pairCelebratePending = true;
  pair.disabled = true;
  if (pairLabel instanceof HTMLElement) {
    pairLabel.textContent = "Koppelt…";
  }

  const result: unknown = await chrome.runtime.sendMessage({
    type: "pair",
    code,
    gatewayBaseUrl: gatewayInput.value.trim() || "http://127.0.0.1:18789",
  });

  if (isRecord(result) && result.ok === false) {
    pairCelebratePending = false;
    setPairButtonPaired(false);
    openConnectionPanel();
    const message =
      typeof result.message === "string" ? result.message : "Koppeln fehlgeschlagen.";
    setPairBanner("error", message);
    const status = readStatusPayload(result);
    if (status) {
      render(status);
    }
    return;
  }

  const status = readStatusPayload(result);
  if (status) {
    render(status);
    if (status.connection !== "connected") {
      pairCelebratePending = false;
      setPairButtonPaired(false);
      openConnectionPanel();
      setPairBanner("error", "Koppeln fehlgeschlagen — Status nicht verbunden.");
    }
  } else {
    pairCelebratePending = false;
    setPairButtonPaired(false);
    openConnectionPanel();
    setPairBanner("error", "Keine Antwort vom Background-Script.");
  }
});

disconnect.addEventListener("click", async () => {
  pairCelebratePending = false;
  setPairBanner(null, "");
  const result: unknown = await chrome.runtime.sendMessage({ type: "disconnect" });
  const status = readStatusPayload(result);
  if (status) {
    render(status);
  } else {
    setPairButtonPaired(false);
  }
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isBackgroundStatus(message)) {
    render(message);
    return;
  }
  if (isPreviewFrame(message)) {
    void handlePreviewFrame(message);
  }
});

async function handlePreviewFrame(frame: SelectionPreviewFrame): Promise<void> {
  if (currentStatus?.lastSelection?.id !== frame.selectionId) {
    return;
  }

  selectionPreviewWrap.hidden = false;
  selectionPreview.hidden = true;
  selectionPreviewStatus.hidden = false;
  selectionPreviewStatus.textContent = "Vorschau wird zugeschnitten…";

  try {
    const cropped = await cropElementPreviewInDom(
      frame.viewportDataUrl,
      frame.box,
      frame.devicePixelRatio,
    );
    // Fallback: show full viewport (scaled by browser) if crop fails.
    const previewDataUrl = cropped ?? frame.viewportDataUrl;
    if (selectionPreview instanceof HTMLImageElement) {
      selectionPreview.hidden = false;
      selectionPreviewStatus.hidden = true;
      selectionPreview.src = previewDataUrl;
    }

    const result: unknown = await chrome.runtime.sendMessage({
      type: "selection_preview_result",
      selectionId: frame.selectionId,
      ok: true,
      previewDataUrl,
    });
    const status = readStatusPayload(result);
    if (status) {
      render(status);
    } else {
      await refresh();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    selectionPreviewStatus.textContent = `Vorschau fehlgeschlagen: ${message}`;
    const result: unknown = await chrome.runtime.sendMessage({
      type: "selection_preview_result",
      selectionId: frame.selectionId,
      ok: false,
      message,
    });
    const status = readStatusPayload(result);
    if (status) {
      render(status);
    }
  }
}

void refresh();
