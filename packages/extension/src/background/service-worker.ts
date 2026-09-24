/**
 * MV3 service worker: pairing, WSS bridge, inspect relay, preview/screenshots (INV-1).
 * Location: packages/extension/src/background/service-worker.ts
 */

import { BridgeClient, completePairing } from "../bridge/client.js";
import { sleep } from "../editor/element-preview.js";
import { boundPngDataUrl, sha256Hex } from "../editor/screenshot-bounds.js";
import {
  clearPairing,
  getOrCreateExtensionInstanceId,
  loadLocalSelections,
  loadPairing,
  saveLocalSelections,
  savePairing,
} from "../shared/storage.js";
import type {
  ActiveChatTarget,
  BackgroundToUi,
  ConnectionState,
  ContentToBackground,
  DomscribeUiState,
  ExtensionToBackground,
  LastSelectionSummary,
  VisualChangePayload,
} from "../shared/types.js";

let bridge: BridgeClient | null = null;
let connection: ConnectionState = "disconnected";
let chat: ActiveChatTarget = {
  sessionKey: null,
  agentId: null,
  title: null,
  status: "none",
  revision: 0,
};
let inspectEnabled = false;
let lastSelectionId: string | null = null;
let lastSelector: string | null = null;
let lastSelection: LastSelectionSummary | null = null;
let lastError: string | null = null;
let lastArtifactId: string | null = null;
let domscribe: DomscribeUiState = "unavailable";
let previewEditingEnabled = true;

/** selectionId → chrome tab that created the selection (agent preview routing). */
const selectionTabById = new Map<string, number>();
/** selectionId → page URL at capture (fallback tab match). */
const selectionPageUrlById = new Map<string, string>();
/** Pending selection.create requestId → tab/page until bridge returns selectionId. */
const pendingCreateByRequestId = new Map<string, { tabId: number; pageUrl: string }>();

function mapSourceFreshness(value: unknown): DomscribeUiState | undefined {
  if (value === "fresh") return "available";
  if (value === "stale") return "stale";
  if (value === "unavailable" || value === "unmapped") return "unavailable";
  return undefined;
}

function rememberSelectionOwner(
  selectionId: string,
  tabId: number,
  pageUrl: string,
): void {
  selectionTabById.set(selectionId, tabId);
  if (pageUrl.length > 0) {
    selectionPageUrlById.set(selectionId, pageUrl);
  }
}

function forgetSelectionOwner(selectionId: string): void {
  selectionTabById.delete(selectionId);
  selectionPageUrlById.delete(selectionId);
}

async function activeTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function sendToTab(tabId: number, message: unknown): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message);
}

async function sendToActiveTab(message: unknown): Promise<unknown> {
  const tabId = await activeTabId();
  if (tabId === undefined) {
    throw new Error("Kein aktiver Tab");
  }
  return sendToTab(tabId, message);
}

function urlsMatch(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.origin === right.origin && left.pathname === right.pathname;
  } catch {
    return a === b;
  }
}

/**
 * Resolve the tab that owns a selection for agent preview.
 * Never falls back to the active tab — that would apply styles to the wrong page.
 */
async function resolvePreviewTabId(
  selectionId: string,
  pageUrl?: string,
): Promise<number | undefined> {
  const owned = selectionTabById.get(selectionId);
  if (owned !== undefined) {
    try {
      const tab = await chrome.tabs.get(owned);
      if (tab.id !== undefined) {
        return tab.id;
      }
    } catch {
      forgetSelectionOwner(selectionId);
    }
  }

  const candidateUrl = pageUrl ?? selectionPageUrlById.get(selectionId);
  if (candidateUrl === undefined || candidateUrl.length === 0) {
    return undefined;
  }

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id === undefined || typeof tab.url !== "string") continue;
    if (urlsMatch(tab.url, candidateUrl)) {
      rememberSelectionOwner(selectionId, tab.id, candidateUrl);
      return tab.id;
    }
  }
  return undefined;
}

function statusPayload(): BackgroundToUi {
  return {
    type: "status",
    connection,
    chat,
    domscribe,
    inspectEnabled,
    lastSelectionId,
    lastSelector,
    lastSelection,
    lastError,
    paired: bridge !== null || connection === "connected" || connection === "reconnecting",
    previewEditingEnabled,
    lastArtifactId,
  };
}

function broadcastStatus(): void {
  chrome.runtime.sendMessage(statusPayload()).catch(() => undefined);
}

async function ensureInspectOnTab(tabId: number, enabled: boolean): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "inspect_set", enabled });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tabId, { type: "inspect_set", enabled });
      return true;
    } catch {
      return false;
    }
  }
}

async function broadcastInspect(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      if (tab.url && !/^https?:/i.test(tab.url)) return;
      await ensureInspectOnTab(tab.id, inspectEnabled);
    }),
  );
}

const CAPTURE_MIN_INTERVAL_MS = 1100;

type SelectionPreviewJob = {
  selectionId: string;
  tabId: number;
  windowId: number;
  box: { x: number; y: number; width: number; height: number };
  devicePixelRatio: number;
};

let lastCaptureVisibleTabAt = 0;
let previewJobLatest: SelectionPreviewJob | null = null;
let previewWorkerRunning = false;

let lastPreviewJob: SelectionPreviewJob | null = null;

function enqueueSelectionPreview(job: SelectionPreviewJob): void {
  lastPreviewJob = job;
  previewJobLatest = job;
  void pumpSelectionPreviewQueue();
}

async function pumpSelectionPreviewQueue(): Promise<void> {
  if (previewWorkerRunning) {
    return;
  }
  previewWorkerRunning = true;
  try {
    while (previewJobLatest) {
      const job = previewJobLatest;
      previewJobLatest = null;

      if (!lastSelection || lastSelection.id !== job.selectionId) {
        continue;
      }

      const waitMs = CAPTURE_MIN_INTERVAL_MS - (Date.now() - lastCaptureVisibleTabAt);
      if (waitMs > 0) {
        setPreviewPending(
          job.selectionId,
          `Vorschau wartet kurz (${Math.ceil(waitMs / 100) / 10}s) — Chrome-Screenshot-Limit…`,
        );
        await sleep(waitMs);
      }

      // A newer click may have superseded this job while we waited.
      if (previewJobLatest) {
        continue;
      }
      if (!lastSelection || lastSelection.id !== job.selectionId) {
        continue;
      }

      await captureSelectionPreviewOnce(job);
    }
  } finally {
    previewWorkerRunning = false;
    if (previewJobLatest) {
      void pumpSelectionPreviewQueue();
    }
  }
}

function setPreviewPending(selectionId: string, message: string): void {
  if (!lastSelection || lastSelection.id !== selectionId) {
    return;
  }
  lastSelection = {
    ...lastSelection,
    previewStatus: "pending",
    previewError: message,
  };
  broadcastStatus();
}

function setPreviewFailed(selectionId: string, message: string): void {
  if (!lastSelection || lastSelection.id !== selectionId) {
    return;
  }
  lastSelection = {
    ...lastSelection,
    previewStatus: "failed",
    previewError: message,
  };
  broadcastStatus();
}

function isCaptureQuotaError(message: string): boolean {
  return /CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|quota/i.test(message);
}

const QUOTA_BACKOFF_MS = [1500, 2500, 4000];

let captureChain: Promise<unknown> = Promise.resolve();

/**
 * Every captureVisibleTab call in the extension goes through here: calls are
 * serialized, and the interval counts from the last attempt (failed ones too).
 */
function captureVisibleTabRateLimited(windowId: number): Promise<string> {
  const run = async (): Promise<string> => {
    const waitMs = CAPTURE_MIN_INTERVAL_MS - (Date.now() - lastCaptureVisibleTabAt);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastCaptureVisibleTabAt = Date.now();
    return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  };
  const next = captureChain.then(run, run);
  captureChain = next.catch(() => undefined);
  return next;
}

async function captureSelectionPreviewOnce(input: SelectionPreviewJob): Promise<void> {
  try {
    // Let the inspect overlay paint-hide settle.
    await sleep(60);

    let dataUrl: string | undefined;
    let lastErr = "";
    for (let attempt = 0; attempt <= QUOTA_BACKOFF_MS.length; attempt += 1) {
      try {
        dataUrl = await captureVisibleTabRateLimited(input.windowId);
        break;
      } catch (error) {
        lastErr = error instanceof Error ? error.message : String(error);
        const backoff = QUOTA_BACKOFF_MS[attempt];
        if (!isCaptureQuotaError(lastErr) || backoff === undefined) {
          break;
        }
        setPreviewPending(
          input.selectionId,
          `Chrome erlaubt nur wenige Screenshots pro Sekunde — neuer Versuch in ${backoff / 1000}s…`,
        );
        await sleep(backoff);
        if (previewJobLatest || !lastSelection || lastSelection.id !== input.selectionId) {
          return;
        }
      }
    }

    if (dataUrl === undefined) {
      const hint = /all_urls|activeTab/i.test(lastErr)
        ? "Extension hat keine Screenshot-Berechtigung — in chrome://extensions neu laden und Zugriff auf alle Websites erlauben. "
        : "";
      setPreviewFailed(input.selectionId, `${hint}Screenshot fehlgeschlagen: ${lastErr}`);
      return;
    }

    if (!lastSelection || lastSelection.id !== input.selectionId) {
      return;
    }

    chrome.runtime
      .sendMessage({
        type: "selection_preview_frame",
        selectionId: input.selectionId,
        viewportDataUrl: dataUrl,
        box: input.box,
        devicePixelRatio: input.devicePixelRatio,
      })
      .catch(() => {
        setPreviewFailed(input.selectionId, "Side Panel nicht erreichbar für Vorschau-Crop");
      });
  } catch (error) {
    setPreviewFailed(
      input.selectionId,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPreviewResult(
  value: unknown,
): { ok: boolean; oldValue?: string; message?: string } | undefined {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return undefined;
  }
  const result: { ok: boolean; oldValue?: string; message?: string } = { ok: value.ok };
  if (typeof value.oldValue === "string") {
    result.oldValue = value.oldValue;
  }
  if (typeof value.message === "string") {
    result.message = value.message;
  }
  return result;
}

function attachBridge(config: Awaited<ReturnType<typeof loadPairing>>): void {
  if (!config) return;
  bridge?.stop();
  bridge = new BridgeClient(config, {
    onState: (state) => {
      connection = state;
      if (state === "re_pair_required") {
        void clearPairing();
        bridge = null;
      }
      broadcastStatus();
    },
    onSession: (next) => {
      if (next.revision >= chat.revision) {
        chat = next;
        broadcastStatus();
      }
    },
    onPreviewEditingEnabled: (enabled) => {
      if (previewEditingEnabled !== enabled) {
        previewEditingEnabled = enabled;
        broadcastStatus();
      }
    },
    onError: (message) => {
      lastError = message;
      broadcastStatus();
    },
    onSelectionResult: (result) => {
      if (result.ok && result.selectionId) {
        const previousId = lastSelectionId;
        lastSelectionId = result.selectionId;
        lastError = null;
        if (lastSelection) {
          lastSelection = {
            ...lastSelection,
            id: result.selectionId,
            synced: true,
          };
        }
        if (result.requestId !== undefined) {
          const pending = pendingCreateByRequestId.get(result.requestId);
          if (pending !== undefined) {
            rememberSelectionOwner(result.selectionId, pending.tabId, pending.pageUrl);
            if (previousId !== null && previousId !== result.selectionId) {
              selectionTabById.delete(previousId);
              selectionPageUrlById.delete(previousId);
            }
            pendingCreateByRequestId.delete(result.requestId);
          }
        }
        if (result.artifactId) {
          lastArtifactId = result.artifactId;
        }
        const mapped = mapSourceFreshness(result.sourceFreshness);
        if (mapped !== undefined) {
          domscribe = mapped;
        }
      } else if (result.message) {
        lastError = result.message;
        if (lastSelection) {
          lastSelection = { ...lastSelection, synced: false };
        }
        if (result.requestId !== undefined) {
          pendingCreateByRequestId.delete(result.requestId);
        }
      }
      broadcastStatus();
    },
    onPreviewApply: (command) => {
      void (async () => {
        try {
          const tabId = await resolvePreviewTabId(command.selectionId, command.pageUrl);
          if (tabId === undefined) {
            bridge?.sendPreviewApplyError({
              requestId: command.requestId,
              code: "browser_unavailable",
              message: "Kein Tab für diese Selektion (stale/browser_unavailable)",
            });
            return;
          }
          const raw = await sendToTab(tabId, {
            type: "agent_preview_apply",
            selectionId: command.selectionId,
            selector: command.selector,
            styles: command.styles,
          });
          if (!isRecord(raw) || raw.ok !== true || !Array.isArray(raw.applied)) {
            const code =
              isRecord(raw) && (raw.code === "stale" || raw.code === "forbidden_property")
                ? raw.code
                : "stale";
            const message =
              isRecord(raw) && typeof raw.message === "string"
                ? raw.message
                : "Preview-Apply fehlgeschlagen";
            bridge?.sendPreviewApplyError({
              requestId: command.requestId,
              code,
              message,
            });
            return;
          }
          const applied: Array<{ property: string; value: string; oldValue?: string }> = [];
          for (const item of raw.applied) {
            if (!isRecord(item)) continue;
            if (typeof item.property !== "string" || typeof item.value !== "string") continue;
            const row: { property: string; value: string; oldValue?: string } = {
              property: item.property,
              value: item.value,
            };
            if (typeof item.oldValue === "string") {
              row.oldValue = item.oldValue;
            }
            applied.push(row);
          }
          bridge?.sendPreviewApplyResult({
            requestId: command.requestId,
            selectionId: command.selectionId,
            applied,
          });
        } catch (error) {
          bridge?.sendPreviewApplyError({
            requestId: command.requestId,
            code: "browser_unavailable",
            message: error instanceof Error ? error.message : "Browser-Tab nicht erreichbar",
          });
        }
      })();
    },
    onPreviewClear: (command) => {
      void (async () => {
        try {
          const payload: { type: "agent_preview_clear"; selectionId?: string } = {
            type: "agent_preview_clear",
          };
          if (command.selectionId !== undefined) {
            payload.selectionId = command.selectionId;
            const tabId = await resolvePreviewTabId(command.selectionId);
            if (tabId === undefined) {
              return;
            }
            await sendToTab(tabId, payload);
            return;
          }
          // Global clear: all owned selection tabs (not silent active-tab).
          const tabIds = new Set(selectionTabById.values());
          await Promise.all(
            [...tabIds].map(async (tabId) => {
              try {
                await sendToTab(tabId, payload);
              } catch {
                // Best-effort
              }
            }),
          );
        } catch {
          // Best-effort clear for HMR verify (RISK-009).
        }
      })();
    },
  });
  bridge.start();
}

async function boot(): Promise<void> {
  const pairing = await loadPairing();
  if (pairing) {
    attachBridge(pairing);
  } else {
    connection = "disconnected";
  }
  broadcastStatus();
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  void boot();
});

void boot();

function pushChangeUpdate(selectionId: string, change: VisualChangePayload): void {
  // INV-1: selection.update only — never prepare/admit Send.
  bridge?.sendSelectionUpdate({
    selectionId,
    requestId: `upd_${crypto.randomUUID()}`,
    change,
  });
}

chrome.runtime.onMessage.addListener((message: ExtensionToBackground | ContentToBackground, sender, sendResponse) => {
  void (async () => {
    if (message.type === "get_status") {
      sendResponse(statusPayload());
      return;
    }

    if (message.type === "pair") {
      try {
        const instanceId = await getOrCreateExtensionInstanceId();
        const config = await completePairing({
          gatewayBaseUrl: message.gatewayBaseUrl,
          code: message.code,
          extensionInstanceId: instanceId,
        });
        await savePairing(config);
        lastError = null;
        attachBridge(config);
        sendResponse({ ok: true, status: statusPayload() });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        connection = "re_pair_required";
        broadcastStatus();
        sendResponse({ ok: false, message: lastError, status: statusPayload() });
      }
      return;
    }

    if (message.type === "disconnect") {
      bridge?.stop();
      bridge = null;
      await clearPairing();
      connection = "disconnected";
      chat = {
        sessionKey: null,
        agentId: null,
        title: null,
        status: "none",
        revision: 0,
      };
      selectionTabById.clear();
      selectionPageUrlById.clear();
      pendingCreateByRequestId.clear();
      broadcastStatus();
      sendResponse({ ok: true, status: statusPayload() });
      return;
    }

    if (message.type === "content_ready") {
      if (inspectEnabled && sender.tab?.id !== undefined) {
        await ensureInspectOnTab(sender.tab.id, true);
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "selection_preview_result") {
      if (lastSelection && lastSelection.id === message.selectionId) {
        if (message.ok && typeof message.previewDataUrl === "string") {
          const next = { ...lastSelection };
          delete next.previewError;
          lastSelection = {
            ...next,
            previewDataUrl: message.previewDataUrl,
            previewStatus: "ready",
          };
        } else {
          lastSelection = {
            ...lastSelection,
            previewStatus: "failed",
            previewError:
              typeof message.message === "string"
                ? message.message
                : "Vorschau-Crop fehlgeschlagen",
          };
        }
        broadcastStatus();
      }
      sendResponse({ ok: true, status: statusPayload() });
      return;
    }

    if (message.type === "selection_preview_retry") {
      if (lastPreviewJob && lastSelection && lastSelection.id === lastPreviewJob.selectionId) {
        setPreviewPending(lastPreviewJob.selectionId, "Vorschau wird neu erstellt…");
        enqueueSelectionPreview(lastPreviewJob);
      }
      sendResponse({ ok: true, status: statusPayload() });
      return;
    }

    if (message.type === "set_inspect") {
      inspectEnabled = message.enabled;
      await broadcastInspect();
      broadcastStatus();
      sendResponse({ ok: true, status: statusPayload() });
      return;
    }

    if (message.type === "remove_selection") {
      const requestId = `rm_${crypto.randomUUID()}`;
      forgetSelectionOwner(message.selectionId);
      bridge?.sendSelectionRemove(message.selectionId, requestId);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "selection_captured") {
      const tabId = sender.tab?.id;
      const selection = { ...message.selection };
      if (tabId !== undefined) {
        selection.tabId = String(tabId);
      }
      const local = await loadLocalSelections();
      local.push(selection);
      await saveLocalSelections(local);

      // Local-first: selection is visible in the side panel without OpenClaw.
      const localId = `local_${crypto.randomUUID()}`;
      lastSelectionId = localId;
      lastSelector = selection.element.selector;
      lastSelection = {
        id: localId,
        tag: selection.element.tag,
        selector: selection.element.selector,
        pageUrl: selection.page.url,
        synced: false,
        previewStatus: selection.element.box !== undefined ? "pending" : "failed",
        ...(selection.page.title !== undefined ? { pageTitle: selection.page.title } : {}),
        ...(selection.element.textSummary !== undefined
          ? { textSummary: selection.element.textSummary }
          : {}),
        ...(selection.element.box !== undefined ? { box: selection.element.box } : {}),
      };
      lastError = null;
      if (tabId !== undefined) {
        rememberSelectionOwner(localId, tabId, selection.page.url);
      }
      broadcastStatus();

      // Element preview crop (async — does not block selection UI).
      const box = selection.element.box;
      const windowId = sender.tab?.windowId;
      if (box !== undefined && tabId !== undefined && windowId !== undefined) {
        enqueueSelectionPreview({
          selectionId: localId,
          tabId,
          windowId,
          box,
          devicePixelRatio: selection.devicePixelRatio ?? 1,
        });
      }

      const requestId = `sel_${crypto.randomUUID()}`;
      if (tabId !== undefined) {
        pendingCreateByRequestId.set(requestId, {
          tabId,
          pageUrl: selection.page.url,
        });
      }
      if (bridge && connection === "connected") {
        bridge.sendSelectionCreate(selection, requestId);
      } else if (pendingCreateByRequestId.has(requestId)) {
        pendingCreateByRequestId.delete(requestId);
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "inspect_limitation") {
      lastError = message.message;
      broadcastStatus();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "preview_edit") {
      if (!previewEditingEnabled) {
        sendResponse({ ok: false, message: "Preview-Editing deaktiviert" });
        return;
      }
      try {
        if (message.apply.kind === "style") {
          const result = readPreviewResult(
            await sendToActiveTab({
              type: "preview_apply_style",
              selector: message.selector,
              property: message.apply.property,
              value: message.apply.value,
            }),
          );
          if (!result?.ok) {
            sendResponse({ ok: false, message: result?.message ?? "Preview fehlgeschlagen" });
            return;
          }
          const change = { ...message.change };
          if (result.oldValue !== undefined && change.oldValue === undefined) {
            change.oldValue = result.oldValue;
          }
          lastSelector = message.selector;
          pushChangeUpdate(message.selectionId, change);
          sendResponse({ ok: true, change, status: statusPayload() });
          return;
        }
        if (message.apply.kind === "text") {
          const result = readPreviewResult(
            await sendToActiveTab({
              type: "preview_apply_text",
              selector: message.selector,
              value: message.apply.value,
            }),
          );
          if (!result?.ok) {
            sendResponse({ ok: false, message: result?.message ?? "Text-Preview fehlgeschlagen" });
            return;
          }
          const change = { ...message.change };
          if (result.oldValue !== undefined && change.oldValue === undefined) {
            change.oldValue = result.oldValue;
          }
          pushChangeUpdate(message.selectionId, change);
          sendResponse({ ok: true, change, status: statusPayload() });
          return;
        }
        // comment — no DOM mutation
        pushChangeUpdate(message.selectionId, message.change);
        sendResponse({ ok: true, change: message.change, status: statusPayload() });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        sendResponse({ ok: false, message: lastError });
      }
      return;
    }

    if (message.type === "preview_revert") {
      try {
        if (message.change.kind === "style" && message.change.property) {
          await sendToActiveTab({
            type: "preview_revert_style",
            selector: message.selector,
            property: message.change.property,
            oldValue: message.change.oldValue ?? "",
          });
        } else if (message.change.kind === "text") {
          await sendToActiveTab({
            type: "preview_revert_text",
            selector: message.selector,
            oldValue: message.change.oldValue ?? "",
          });
        }
        pushChangeUpdate(message.selectionId, message.change);
        sendResponse({ ok: true, status: statusPayload() });
      } catch (error) {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (message.type === "preview_clear") {
      try {
        const styles = message.changes
          .filter((c) => c.kind === "style" && c.property && c.status === "pending")
          .map((c) => ({
            property: c.property!,
            oldValue: c.oldValue ?? "",
          }));
        const textChange = message.changes.find((c) => c.kind === "text" && c.status === "pending");
        await sendToActiveTab({
          type: "preview_clear_all",
          selector: message.selector,
          styles,
          ...(textChange?.oldValue !== undefined ? { textOldValue: textChange.oldValue } : {}),
        });
        for (const change of message.changes) {
          if (change.status === "pending") {
            pushChangeUpdate(message.selectionId, { ...change, status: "reverted" });
          }
        }
        sendResponse({ ok: true, status: statusPayload() });
      } catch (error) {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (message.type === "capture_screenshot") {
      if (!previewEditingEnabled) {
        sendResponse({ ok: false, message: "Screenshot-Upload deaktiviert" });
        return;
      }
      try {
        const dataUrl = await captureVisibleTabRateLimited(
          (await chrome.windows.getCurrent()).id ?? chrome.windows.WINDOW_ID_CURRENT,
        );
        const bounded = boundPngDataUrl(dataUrl);
        if (!bounded.ok) {
          sendResponse({ ok: false, message: bounded.message, code: bounded.code });
          return;
        }
        const binary = Uint8Array.from(atob(bounded.pngBase64), (c) => c.charCodeAt(0));
        const contentHash = await sha256Hex(binary);
        const capturedAt = new Date().toISOString();
        const width = message.box?.width ?? 1;
        const height = message.box?.height ?? 1;
        // Element screenshots: still viewport capture referenced by selection (crop deferred).
        bridge?.sendArtifactUpload({
          requestId: `art_${crypto.randomUUID()}`,
          selectionId: message.selectionId,
          mime: "image/png",
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
          byteSize: bounded.byteSize,
          pngBase64: bounded.pngBase64,
          contentHash,
          kind: message.kind,
          ...(message.pageUrl !== undefined ? { pageUrl: message.pageUrl } : {}),
          capturedAt,
        });
        sendResponse({ ok: true, status: statusPayload() });
      } catch (error) {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  })();
  return true;
});
