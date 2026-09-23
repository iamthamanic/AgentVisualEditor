/**
 * HTTP + WSS bridge routes for extension pairing (auth: plugin).
 * Location: packages/openclaw-plugin/src/bridge-routes.ts
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import {
  rejectWebSocketUpgrade,
  startWebSocketKeepalive,
  WebSocketServer,
  type RawData,
  type WebSocket,
} from "openclaw/plugin-sdk/websocket-runtime";
import {
  PROTOCOL_VERSION,
  parsePairingComplete,
  type ActiveSessionChanged,
  type ErrorEnvelope,
  type PreviewApplyCommand,
  type PreviewApplyResultMessage,
  type PreviewClearCommand,
} from "@agent-visual-editor/protocol";
import type { SourceResolver } from "@agent-visual-editor/domscribe-adapter";
import type { ActiveSessionTracker } from "./active-session.js";
import type { ArtifactStore } from "./artifact-store.js";
import { BridgeMessageHandler } from "./bridge-handler.js";
import {
  BRIDGE_PATH,
  PAIRING_COMPLETE_PATH,
  type PairedConnection,
  type PairingStore,
} from "./pairing.js";
import type { VisualBatchStore } from "./store.js";

function rawDataToUtf8(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(new Uint8Array(data)).toString("utf8");
}

type JsonBody = Record<string, unknown>;

type PluginHttpRouteApi = {
  registerHttpRoute: (params: {
    path: string;
    auth: "gateway" | "plugin";
    match?: "exact" | "prefix";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean | void> | boolean | void;
    handleUpgrade?: (
      req: IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ) => Promise<boolean | void> | boolean | void;
  }) => void;
};

async function readJsonBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw new Error("payload_too_large");
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function extractBearerToken(req: IncomingMessage, url: URL): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  const protocolHeader = req.headers["sec-websocket-protocol"];
  if (typeof protocolHeader === "string") {
    for (const part of protocolHeader.split(",")) {
      const proto = part.trim();
      if (proto.startsWith("ave-auth.")) {
        const token = proto.slice("ave-auth.".length).trim();
        if (token.length > 0) {
          return token;
        }
      }
    }
  }

  // Loopback ?token= is an accepted local-gateway convenience (prefer Sec-WebSocket-Protocol
  // ave-auth.* / Authorization Bearer in production). Token is only read when Host is loopback.
  const hostHeader = req.headers.host;
  const hostName =
    typeof hostHeader === "string" ? hostHeader.split(":")[0]?.toLowerCase() ?? "" : "";
  const isLoopbackHost = hostName === "127.0.0.1" || hostName === "localhost" || hostName === "[::1]";
  if (isLoopbackHost) {
    const queryToken = url.searchParams.get("token");
    if (typeof queryToken === "string" && queryToken.trim().length > 0) {
      return queryToken.trim();
    }
  }

  return undefined;
}

function selectAveAuthProtocol(protocols: Set<string> | string[]): string | false {
  const list = Array.isArray(protocols) ? protocols : [...protocols];
  for (const proto of list) {
    if (proto.startsWith("ave-auth.")) {
      return proto;
    }
  }
  return false;
}

export type BridgeRouteContext = {
  api: PluginHttpRouteApi;
  pairing: PairingStore;
  sessions: ActiveSessionTracker;
  store: VisualBatchStore;
  onBatchChanged: (agentId: string, sessionKey: string) => void;
  sourceResolver?: SourceResolver;
  artifacts?: ArtifactStore;
  previewEditingEnabled?: boolean;
};

export type LiveBridgeSocket = {
  connectionId: string;
  socket: WebSocket;
  close: (code?: number, reason?: string) => void;
};

export class BridgeHub {
  private readonly sockets = new Map<string, Set<LiveBridgeSocket>>();
  /** selectionId → owning connectionId (preview.apply unicast). */
  private readonly selectionOwners = new Map<string, string>();
  /** Allow up to ~3 MiB JSON (2 MiB PNG + base64 overhead) for C-009. */
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 3 * 1024 * 1024,
    handleProtocols: selectAveAuthProtocol,
  });
  private readonly pendingApplies = new Map<
    string,
    {
      ownerConnectionId: string;
      resolve: (
        value:
          | { ok: true; applied: PreviewApplyResultMessage["applied"] }
          | {
              ok: false;
              code: "stale" | "browser_unavailable" | "forbidden_property";
              message: string;
            },
      ) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly ctx: BridgeRouteContext) {}

  rememberSelectionOwner(selectionId: string, connectionId: string): void {
    this.selectionOwners.set(selectionId, connectionId);
  }

  forgetSelectionOwner(selectionId: string): void {
    this.selectionOwners.delete(selectionId);
  }

  private sendToConnection(connectionId: string, payload: string): boolean {
    const set = this.sockets.get(connectionId);
    if (!set) {
      return false;
    }
    let sent = false;
    for (const live of set) {
      if (live.socket.readyState === 1) {
        live.socket.send(payload);
        sent = true;
      }
    }
    return sent;
  }

  /** True when at least one live paired bridge socket is open. */
  hasLiveBrowser(): boolean {
    for (const set of this.sockets.values()) {
      for (const live of set) {
        if (live.socket.readyState === 1) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * C-015: push preview.apply to the owning browser and await preview.apply.result.
   */
  requestPreviewApply(
    command: PreviewApplyCommand,
    timeoutMs = 8_000,
  ): Promise<
    | { ok: true; applied: PreviewApplyResultMessage["applied"] }
    | {
        ok: false;
        code: "stale" | "browser_unavailable" | "forbidden_property";
        message: string;
      }
  > {
    const ownerId = this.selectionOwners.get(command.selectionId);
    if (ownerId === undefined) {
      return Promise.resolve({
        ok: false,
        code: "browser_unavailable",
        message: "Kein Browser-Owner für diese Selektion",
      });
    }
    if (!this.sendToConnection(ownerId, JSON.stringify(command))) {
      return Promise.resolve({
        ok: false,
        code: "browser_unavailable",
        message: "Kein gekoppelter Browser verfügbar",
      });
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApplies.delete(command.requestId);
        resolve({
          ok: false,
          code: "browser_unavailable",
          message: "Browser-Antwort Timeout",
        });
      }, timeoutMs);

      this.pendingApplies.set(command.requestId, {
        ownerConnectionId: ownerId,
        resolve,
        timer,
      });
    });
  }

  /** RISK-009: ask owning extension to disable agent preview overrides. */
  clearPreview(selectionId?: string): void {
    const command: PreviewClearCommand = {
      type: "preview.clear",
      protocolVersion: PROTOCOL_VERSION,
      requestId: `clr_${crypto.randomUUID().replace(/-/g, "")}`,
      ...(selectionId !== undefined ? { selectionId } : {}),
    };
    const payload = JSON.stringify(command);
    if (selectionId !== undefined) {
      const ownerId = this.selectionOwners.get(selectionId);
      if (ownerId === undefined) {
        return;
      }
      this.sendToConnection(ownerId, payload);
      return;
    }
    for (const set of this.sockets.values()) {
      for (const live of set) {
        if (live.socket.readyState === 1) {
          live.socket.send(payload);
        }
      }
    }
  }

  /**
   * Resolve a pending preview.apply only when the sending connection owns it.
   * Results from other sockets are ignored (spoof protection).
   */
  private resolvePendingApply(raw: unknown, connectionId: string): boolean {
    if (typeof raw !== "object" || raw === null) {
      return false;
    }
    const requestId =
      "requestId" in raw && typeof raw.requestId === "string" ? raw.requestId : undefined;
    if (requestId === undefined) {
      return false;
    }
    const pending = this.pendingApplies.get(requestId);
    if (!pending) {
      return false;
    }
    if (connectionId !== pending.ownerConnectionId) {
      return false;
    }

    const type = "type" in raw && typeof raw.type === "string" ? raw.type : undefined;
    const ok = "ok" in raw ? raw.ok : undefined;

    if (type === "preview.apply.result" && ok === true) {
      clearTimeout(pending.timer);
      this.pendingApplies.delete(requestId);
      const applied: PreviewApplyResultMessage["applied"] = [];
      const appliedRaw = "applied" in raw ? raw.applied : undefined;
      if (Array.isArray(appliedRaw)) {
        for (const item of appliedRaw) {
          if (typeof item !== "object" || item === null) continue;
          const property =
            "property" in item && typeof item.property === "string" ? item.property : undefined;
          const value = "value" in item && typeof item.value === "string" ? item.value : undefined;
          if (property === undefined || value === undefined) continue;
          const entry: { property: string; value: string; oldValue?: string } = {
            property,
            value,
          };
          if ("oldValue" in item && typeof item.oldValue === "string") {
            entry.oldValue = item.oldValue;
          }
          applied.push(entry);
        }
      }
      pending.resolve({ ok: true, applied });
      return true;
    }

    if (ok === false && "code" in raw && typeof raw.code === "string") {
      const code = raw.code;
      if (code === "stale" || code === "browser_unavailable" || code === "forbidden_property") {
        clearTimeout(pending.timer);
        this.pendingApplies.delete(requestId);
        pending.resolve({
          ok: false,
          code,
          message:
            "message" in raw && typeof raw.message === "string"
              ? raw.message
              : "Preview-Apply fehlgeschlagen",
        });
        return true;
      }
    }

    return false;
  }

  registerRoutes(): void {
    this.ctx.api.registerHttpRoute({
      path: PAIRING_COMPLETE_PATH,
      auth: "plugin",
      match: "exact",
      handler: async (req, res) => this.handlePairingComplete(req, res),
    });

    this.ctx.api.registerHttpRoute({
      path: BRIDGE_PATH,
      auth: "plugin",
      match: "exact",
      handler: async (_req, res) => {
        res.writeHead(426, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Upgrade Required: AgentVisualEditor Bridge über WebSocket verbinden.");
        return true;
      },
      handleUpgrade: async (req, socket, head) => this.handleBridgeUpgrade(req, socket, head),
    });
  }

  broadcastSession(event: ActiveSessionChanged): void {
    const payload = JSON.stringify(event);
    for (const set of this.sockets.values()) {
      for (const live of set) {
        if (live.socket.readyState === 1) {
          live.socket.send(payload);
        }
      }
    }
  }

  terminateConnection(connectionId: string): void {
    const set = this.sockets.get(connectionId);
    if (!set) {
      return;
    }
    for (const live of set) {
      live.close(4001, "revoked");
    }
    this.sockets.delete(connectionId);
  }

  private async handlePairingComplete(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.method !== "POST") {
      sendJson(res, 405, {
        ok: false,
        code: "invalid_message",
        message: "POST erforderlich",
      } satisfies ErrorEnvelope);
      return true;
    }
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      const code = error instanceof Error && error.message === "payload_too_large"
        ? "payload_too_large"
        : "invalid_message";
      sendJson(res, 400, {
        ok: false,
        code,
        message: "Anfrage ungültig oder zu groß",
      } satisfies ErrorEnvelope);
      return true;
    }

    // Whitelist pairing.complete fields only (ignore unknown keys).
    let normalized: unknown = body;
    if (typeof body === "object" && body !== null) {
      const source = body as Record<string, unknown>;
      const record: JsonBody = {
        type: "pairing.complete",
        protocolVersion:
          typeof source.protocolVersion === "number"
            ? source.protocolVersion
            : PROTOCOL_VERSION,
      };
      if (typeof source.code === "string") {
        record.code = source.code;
      }
      if (typeof source.extensionInstanceId === "string") {
        record.extensionInstanceId = source.extensionInstanceId;
      }
      if (typeof source.extensionLabel === "string") {
        record.extensionLabel = source.extensionLabel;
      }
      normalized = record;
    }

    const parsed = parsePairingComplete(normalized);
    if (!parsed.ok) {
      sendJson(res, 400, parsed.error);
      return true;
    }

    const result = this.ctx.pairing.complete({
      code: parsed.message.code,
      extensionInstanceId: parsed.message.extensionInstanceId,
      protocolVersion: parsed.message.protocolVersion,
      ...(parsed.message.extensionLabel !== undefined
        ? { extensionLabel: parsed.message.extensionLabel }
        : {}),
    });
    if (!result.ok) {
      const status = result.code === "rate_limited" ? 429 : 400;
      sendJson(res, status, {
        ok: false,
        code: result.code,
        message: result.message,
      } satisfies ErrorEnvelope);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  private async handleBridgeUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== BRIDGE_PATH) {
      return false;
    }
    const token = extractBearerToken(req, url);
    if (!token) {
      rejectWebSocketUpgrade(socket, { status: 401, reason: "unauthorized" });
      return true;
    }
    const connection = this.ctx.pairing.authenticateToken(token);
    if (!connection) {
      rejectWebSocketUpgrade(socket, { status: 401, reason: "unauthorized" });
      return true;
    }

    this.wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      this.bindSocket(connection, ws);
    });
    return true;
  }

  private bindSocket(connection: PairedConnection, ws: WebSocket): void {
    const handler = new BridgeMessageHandler({
      store: this.ctx.store,
      sessions: this.ctx.sessions,
      connection,
      onBatchChanged: this.ctx.onBatchChanged,
      onSelectionCreated: (selectionId) => {
        this.rememberSelectionOwner(selectionId, connection.connectionId);
      },
      onSelectionRemoved: (selectionId) => {
        this.forgetSelectionOwner(selectionId);
      },
      ...(this.ctx.sourceResolver !== undefined
        ? { sourceResolver: this.ctx.sourceResolver }
        : {}),
      ...(this.ctx.artifacts !== undefined ? { artifacts: this.ctx.artifacts } : {}),
      previewEditingEnabled: this.ctx.previewEditingEnabled ?? true,
    });

    const live: LiveBridgeSocket = {
      connectionId: connection.connectionId,
      socket: ws,
      close: (code, reason) => {
        try {
          ws.close(code, reason);
        } catch {
          ws.terminate();
        }
      },
    };

    let set = this.sockets.get(connection.connectionId);
    if (!set) {
      set = new Set();
      this.sockets.set(connection.connectionId, set);
    }
    set.add(live);

    const stopKeepalive = startWebSocketKeepalive(ws, () => ws.terminate());

    // Push current session snapshot immediately after connect.
    ws.send(JSON.stringify(this.ctx.sessions.toEvent()));

    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        ws.send(
          JSON.stringify({
            ok: false,
            code: "invalid_type",
            message: "Binärframes sind nicht erlaubt",
          } satisfies ErrorEnvelope),
        );
        return;
      }
      const text = rawDataToUtf8(data);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        ws.send(
          JSON.stringify({
            ok: false,
            code: "invalid_message",
            message: "JSON erwartet",
          } satisfies ErrorEnvelope),
        );
        return;
      }
      if (this.resolvePendingApply(raw, connection.connectionId)) {
        return;
      }
      void handler.handleRaw(raw).then((result) => {
        ws.send(JSON.stringify(result));
      });
    });

    ws.on("close", () => {
      stopKeepalive();
      set?.delete(live);
      if (set && set.size === 0) {
        this.sockets.delete(connection.connectionId);
        for (const [selectionId, ownerId] of this.selectionOwners) {
          if (ownerId === connection.connectionId) {
            this.selectionOwners.delete(selectionId);
          }
        }
      }
    });

    ws.on("error", () => {
      ws.terminate();
    });
  }
}

export function registerBridgeRoutes(ctx: BridgeRouteContext): BridgeHub {
  const hub = new BridgeHub(ctx);
  hub.registerRoutes();
  return hub;
}
