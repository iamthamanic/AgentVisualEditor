/**
 * MV3 service worker: pairing, WSS bridge, inspect relay (INV-1: never auto-send).
 * Location: packages/extension/src/background/service-worker.ts
 */

import { BridgeClient, completePairing } from "../bridge/client.js";
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
let lastError: string | null = null;
const domscribe: DomscribeUiState = "unavailable";

function statusPayload(): BackgroundToUi {
  return {
    type: "status",
    connection,
    chat,
    domscribe,
    inspectEnabled,
    lastSelectionId,
    lastError,
    paired: bridge !== null || connection === "connected" || connection === "reconnecting",
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
      // Latest revision wins (C-005).
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
      const requestId = `sel_${crypto.randomUUID()}`;
      // INV-1: only bridge attach — never triggers OpenClaw send.
      bridge?.sendSelectionCreate(message.selection, requestId);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "inspect_limitation") {
      lastError = message.message;
      broadcastStatus();
      sendResponse({ ok: true });
    }
  })();
  return true;
});
