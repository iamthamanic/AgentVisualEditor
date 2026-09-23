/**
 * MV3 service worker: pairing, WSS bridge, inspect relay, preview/screenshots (INV-1).
 * Location: packages/extension/src/background/service-worker.ts
 */

import { BridgeClient, completePairing } from "../bridge/client.js";
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
let lastError: string | null = null;
let lastArtifactId: string | null = null;
let domscribe: DomscribeUiState = "unavailable";
const previewEditingEnabled = true;

function mapSourceFreshness(value: unknown): DomscribeUiState | undefined {
  if (value === "fresh") return "available";
  if (value === "stale") return "stale";
  if (value === "unavailable" || value === "unmapped") return "unavailable";
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
    lastError,
    paired: bridge !== null || connection === "connected" || connection === "reconnecting",
    previewEditingEnabled,
    lastArtifactId,
  };
}

function broadcastStatus(): void {
  chrome.runtime.sendMessage(statusPayload()).catch(() => undefined);
}

async function broadcastInspect(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "inspect_set", enabled: inspectEnabled });
      } catch {
        // Tab without content script (chrome:// etc.)
      }
    }),
  );
}

async function activeTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function sendToActiveTab(message: unknown): Promise<unknown> {
  const tabId = await activeTabId();
  if (tabId === undefined) {
    throw new Error("Kein aktiver Tab");
  }
  return chrome.tabs.sendMessage(tabId, message);
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
    onError: (message) => {
      lastError = message;
      broadcastStatus();
    },
    onSelectionResult: (result) => {
      if (result.ok && result.selectionId) {
        lastSelectionId = result.selectionId;
        lastError = null;
        if (result.artifactId) {
          lastArtifactId = result.artifactId;
        }
        const mapped = mapSourceFreshness(result.sourceFreshness);
        if (mapped !== undefined) {
          domscribe = mapped;
        }
      } else if (result.message) {
        lastError = result.message;
      }
      broadcastStatus();
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

chrome.runtime.onMessage.addListener((message: ExtensionToBackground | ContentToBackground, _sender, sendResponse) => {
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
      broadcastStatus();
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
      bridge?.sendSelectionRemove(message.selectionId, requestId);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "selection_captured") {
      const local = await loadLocalSelections();
      local.push(message.selection);
      await saveLocalSelections(local);
      lastSelector = message.selection.element.selector;
      const requestId = `sel_${crypto.randomUUID()}`;
      bridge?.sendSelectionCreate(message.selection, requestId);
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
        const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
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
