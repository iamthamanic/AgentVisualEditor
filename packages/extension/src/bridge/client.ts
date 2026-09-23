/**
 * WSS bridge client for paired extension (C-004..C-008).
 * Location: packages/extension/src/bridge/client.ts
 */

import { PROTOCOL_VERSION } from "@agent-visual-editor/protocol";
import { nextBackoffMs, resetBackoff, type BackoffState } from "../shared/reconnect.js";
import type {
  ActiveChatTarget,
  CapturedSelection,
  ConnectionState,
  PairingConfig,
} from "../shared/types.js";

export type BridgeClientCallbacks = {
  onState: (state: ConnectionState) => void;
  onSession: (chat: ActiveChatTarget) => void;
  onError: (message: string) => void;
  onSelectionResult: (result: {
    ok: boolean;
    selectionId?: string;
    artifactId?: string;
    message?: string;
    sourceFreshness?: string;
  }) => void;
};

function toWsUrl(gatewayBaseUrl: string, bridgePath: string, token: string): string {
  const base = new URL(gatewayBaseUrl);
  const wsProtocol = base.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(bridgePath, `${wsProtocol}//${base.host}`);
  url.searchParams.set("token", token);
  return url.toString();
}

function isLoopbackHttpAllowed(url: URL): boolean {
  return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

export function assertAllowedGatewayUrl(gatewayBaseUrl: string): void {
  let url: URL;
  try {
    url = new URL(gatewayBaseUrl);
  } catch {
    throw new Error("Ungültige Gateway-URL");
  }
  if (url.protocol === "https:") {
    return;
  }
  if (isLoopbackHttpAllowed(url)) {
    return;
  }
  throw new Error("Remote-Bridge erfordert HTTPS/WSS (Loopback-HTTP nur lokal erlaubt)");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class BridgeClient {
  private socket: WebSocket | null = null;
  private backoff: BackoffState = resetBackoff();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private helloDone = false;

  constructor(
    private readonly config: PairingConfig,
    private readonly callbacks: BridgeClientCallbacks,
    private readonly bridgePath = "/agent-visual-editor/bridge",
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.callbacks.onState("disconnected");
  }

  sendSelectionCreate(selection: CapturedSelection, requestId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.callbacks.onError("Bridge nicht verbunden");
      return;
    }
    const element: Record<string, unknown> = {
      tag: selection.element.tag,
      selector: selection.element.selector,
    };
    if (selection.element.textSummary !== undefined) {
      element.textSummary = selection.element.textSummary;
    }
    if (selection.element.dataDs !== undefined) {
      element.dataDs = selection.element.dataDs;
    }
    if (selection.element.box !== undefined) {
      element.box = selection.element.box;
    }
    const page: Record<string, unknown> = { url: selection.page.url };
    if (selection.page.title !== undefined) {
      page.title = selection.page.title;
    }
    const msg: Record<string, unknown> = {
      type: "selection.create",
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      page,
      element,
    };
    if (selection.tabId !== undefined) {
      msg.tabId = selection.tabId;
    }
    this.socket.send(JSON.stringify(msg));
  }

  sendSelectionRemove(selectionId: string, requestId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.callbacks.onError("Bridge nicht verbunden");
      return;
    }
    this.socket.send(
      JSON.stringify({
        type: "selection.remove",
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        selectionId,
      }),
    );
  }

  sendSelectionUpdate(input: {
    selectionId: string;
    requestId: string;
    change: {
      id: string;
      kind: "style" | "text" | "attribute" | "comment" | "other";
      property?: string;
      path?: string;
      oldValue?: string;
      newValue?: string;
      status: "pending" | "in_progress" | "resolved" | "reverted";
    };
    revision?: number;
  }): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.callbacks.onError("Bridge nicht verbunden");
      return;
    }
    const change: Record<string, unknown> = {
      id: input.change.id,
      kind: input.change.kind,
      status: input.change.status,
    };
    if (input.change.property !== undefined) change.property = input.change.property;
    if (input.change.path !== undefined) change.path = input.change.path;
    if (input.change.oldValue !== undefined) change.oldValue = input.change.oldValue;
    if (input.change.newValue !== undefined) change.newValue = input.change.newValue;
    const msg: Record<string, unknown> = {
      type: "selection.update",
      protocolVersion: PROTOCOL_VERSION,
      requestId: input.requestId,
      selectionId: input.selectionId,
      change,
    };
    if (input.revision !== undefined) {
      msg.revision = input.revision;
    }
    this.socket.send(JSON.stringify(msg));
  }

  sendArtifactUpload(input: {
    requestId: string;
    selectionId: string;
    mime: "image/png";
    width: number;
    height: number;
    byteSize: number;
    pngBase64: string;
    contentHash?: string;
    kind?: "viewport" | "element";
    pageUrl?: string;
    capturedAt?: string;
  }): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.callbacks.onError("Bridge nicht verbunden");
      return;
    }
    const msg: Record<string, unknown> = {
      type: "artifact.upload",
      protocolVersion: PROTOCOL_VERSION,
      requestId: input.requestId,
      selectionId: input.selectionId,
      mime: input.mime,
      width: input.width,
      height: input.height,
      byteSize: input.byteSize,
      pngBase64: input.pngBase64,
    };
    if (input.contentHash !== undefined) msg.contentHash = input.contentHash;
    if (input.kind !== undefined) msg.kind = input.kind;
    if (input.pageUrl !== undefined) msg.pageUrl = input.pageUrl;
    if (input.capturedAt !== undefined) msg.capturedAt = input.capturedAt;
    this.socket.send(JSON.stringify(msg));
  }

  private connect(): void {
    if (this.stopped) return;
    try {
      assertAllowedGatewayUrl(this.config.gatewayBaseUrl);
    } catch (error) {
      this.callbacks.onState("re_pair_required");
      this.callbacks.onError(error instanceof Error ? error.message : String(error));
      return;
    }

    this.callbacks.onState(this.backoff.attempt === 0 ? "connecting" : "reconnecting");
    const url = toWsUrl(this.config.gatewayBaseUrl, this.bridgePath, this.config.token);
    const ws = new WebSocket(url);
    this.socket = ws;
    this.helloDone = false;

    ws.addEventListener("open", () => {
      this.backoff = resetBackoff();
      this.callbacks.onState("connected");
      ws.send(
        JSON.stringify({
          type: "bridge.hello",
          protocolVersion: PROTOCOL_VERSION,
          requestId: `hello_${crypto.randomUUID()}`,
          extensionInstanceId: this.config.extensionInstanceId,
        }),
      );
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }
      this.handleMessage(raw);
    });

    ws.addEventListener("close", (event) => {
      if (this.socket === ws) {
        this.socket = null;
      }
      if (this.stopped) return;
      if (event.code === 4001) {
        this.callbacks.onState("re_pair_required");
        this.callbacks.onError("Verbindung widerrufen — bitte erneut koppeln");
        return;
      }
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // close handler schedules reconnect
    });
  }

  private scheduleReconnect(): void {
    this.callbacks.onState("reconnecting");
    const { delayMs, next } = nextBackoffMs(this.backoff);
    this.backoff = next;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private handleMessage(raw: unknown): void {
    if (!isRecord(raw)) return;
    const msg = raw;

    if (msg.type === "activeSession.changed") {
      const chat: ActiveChatTarget = {
        sessionKey: typeof msg.sessionKey === "string" ? msg.sessionKey : null,
        agentId: typeof msg.agentId === "string" ? msg.agentId : null,
        title: typeof msg.title === "string" ? msg.title : null,
        status:
          msg.status === "active" || msg.status === "ambiguous" || msg.status === "none"
            ? msg.status
            : "none",
        revision: typeof msg.revision === "number" ? msg.revision : 0,
      };
      this.callbacks.onSession(chat);
      return;
    }

    if (msg.ok === true && msg.type === "bridge.hello.ack") {
      this.helloDone = true;
      return;
    }

    if (msg.ok === true && typeof msg.selectionId === "string") {
      this.callbacks.onSelectionResult({
        ok: true,
        selectionId: msg.selectionId,
        ...(typeof msg.artifactId === "string" ? { artifactId: msg.artifactId } : {}),
        ...(typeof msg.sourceFreshness === "string"
          ? { sourceFreshness: msg.sourceFreshness }
          : {}),
      });
      return;
    }

    if (msg.ok === false && typeof msg.message === "string") {
      if (msg.code === "unauthorized") {
        this.callbacks.onState("re_pair_required");
      }
      this.callbacks.onSelectionResult({
        ok: false,
        message: msg.message,
      });
      this.callbacks.onError(msg.message);
    }

    void this.helloDone;
  }
}

export async function completePairing(input: {
  gatewayBaseUrl: string;
  code: string;
  extensionInstanceId: string;
}): Promise<PairingConfig> {
  assertAllowedGatewayUrl(input.gatewayBaseUrl);
  const base = input.gatewayBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/agent-visual-editor/pairing/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "pairing.complete",
      protocolVersion: PROTOCOL_VERSION,
      code: input.code.trim().toUpperCase(),
      extensionInstanceId: input.extensionInstanceId,
      extensionLabel: "Chrome Extension",
    }),
  });
  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error("Ungültige Pairing-Antwort");
  }
  const result = body;
  if (result.ok !== true) {
    const message = typeof result.message === "string" ? result.message : "Pairing fehlgeschlagen";
    throw new Error(message);
  }
  if (
    typeof result.connectionId !== "string" ||
    typeof result.token !== "string" ||
    !result.token.startsWith("ave_")
  ) {
    throw new Error("Ungültige Pairing-Antwort");
  }
  return {
    gatewayBaseUrl: base,
    connectionId: result.connectionId,
    token: result.token,
    extensionInstanceId: input.extensionInstanceId,
  };
}
