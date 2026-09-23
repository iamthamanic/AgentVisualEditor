/**
 * Content-script Inspect Mode: hover highlight + click capture (FR-004).
 * Location: packages/extension/src/content/inspect.ts
 *
 * Overlay only for inspect — preview mutations go through preview.ts /
 * agent-preview.ts (INV-1).
 */

import {
  captureSelectionFromElement,
  isCrossOriginIframe,
} from "./capture.js";
import { handleAgentPreviewMessage, type AgentPreviewMessage } from "./agent-preview.js";
import { handlePreviewMessage, type PreviewMessage } from "./preview.js";
import { shouldIgnoreInspectShortcut } from "../editor/keyboard.js";
import type { BackgroundToContent, ContentToBackground } from "../shared/types.js";

const OVERLAY_ID = "ave-inspect-overlay";

let inspectEnabled = false;
let overlay: HTMLDivElement | null = null;
let lastTarget: Element | null = null;

function ensureOverlay(): HTMLDivElement {
  if (overlay && overlay.isConnected) {
    return overlay;
  }
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  el.setAttribute("data-ave-overlay", "true");
  el.style.cssText = [
    "position:fixed",
    "pointer-events:none",
    "z-index:2147483646",
    "border:2px solid #0a7cff",
    "background:rgba(10,124,255,0.12)",
    "box-sizing:border-box",
    "display:none",
    "top:0",
    "left:0",
  ].join(";");
  document.documentElement.appendChild(el);
  overlay = el;
  return el;
}

function hideOverlay(): void {
  if (overlay) {
    overlay.style.display = "none";
  }
  lastTarget = null;
}

function positionOverlay(target: Element): void {
  const box = ensureOverlay();
  const rect = target.getBoundingClientRect();
  box.style.display = "block";
  box.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
  box.style.width = `${Math.max(0, Math.round(rect.width))}px`;
  box.style.height = `${Math.max(0, Math.round(rect.height))}px`;
  lastTarget = target;
}

function resolveEventTarget(event: Event): Element | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (node instanceof Element) {
      if (node.id === OVERLAY_ID || node.getAttribute("data-ave-overlay") === "true") {
        continue;
      }
      return node;
    }
  }
  const t = event.target;
  return t instanceof Element ? t : null;
}

function post(message: ContentToBackground): void {
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

function onPointerMove(event: PointerEvent): void {
  if (!inspectEnabled) return;
  const target = resolveEventTarget(event);
  if (!target || target === document.documentElement || target === document.body) {
    hideOverlay();
    return;
  }
  positionOverlay(target);
}

function onClick(event: MouseEvent): void {
  if (!inspectEnabled) return;
  event.preventDefault();
  event.stopPropagation();

  const target = resolveEventTarget(event);
  if (!target) {
    return;
  }

  if (isCrossOriginIframe(target)) {
    post({
      type: "inspect_limitation",
      code: "cross_origin_iframe",
      message: "Cross-Origin-iframe kann nicht inspiziert werden",
    });
    return;
  }

  const pageTitle = document.title || undefined;
  const selection = captureSelectionFromElement(target, {
    url: location.href,
    ...(pageTitle !== undefined ? { title: pageTitle } : {}),
  });
  post({ type: "selection_captured", selection });
}

function onKeyDown(event: KeyboardEvent): void {
  if (!inspectEnabled) return;
  // EDGE-017 / T-023: do not tear down inspect while typing in inputs.
  if (shouldIgnoreInspectShortcut(event)) {
    return;
  }
  if (event.key === "Escape") {
    setInspect(false);
    post({
      type: "inspect_limitation",
      code: undefined,
      message: "Inspect Mode beendet",
    });
  }
}

function setInspect(enabled: boolean): void {
  inspectEnabled = enabled;
  if (enabled) {
    ensureOverlay();
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  } else {
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    hideOverlay();
    overlay?.remove();
    overlay = null;
  }
}

function isPreviewMessage(message: unknown): message is PreviewMessage {
  if (!isRecord(message)) {
    return false;
  }
  const type = message.type;
  return (
    type === "preview_apply_style" ||
    type === "preview_apply_text" ||
    type === "preview_revert_style" ||
    type === "preview_revert_text" ||
    type === "preview_clear_all"
  );
}

function isAgentPreviewMessage(message: unknown): message is AgentPreviewMessage {
  if (!isRecord(message)) {
    return false;
  }
  return message.type === "agent_preview_apply" || message.type === "agent_preview_clear";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundToContent | PreviewMessage | AgentPreviewMessage,
    _sender,
    sendResponse,
  ) => {
    if (message.type === "inspect_set") {
      setInspect(message.enabled);
      sendResponse({ ok: true });
      return true;
    }
    if (isPreviewMessage(message)) {
      sendResponse(handlePreviewMessage(message));
      return true;
    }
    if (isAgentPreviewMessage(message)) {
      sendResponse(handleAgentPreviewMessage(message));
      return true;
    }
    return false;
  },
);

void lastTarget;
