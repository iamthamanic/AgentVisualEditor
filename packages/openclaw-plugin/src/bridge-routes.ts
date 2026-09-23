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
} from "@agent-visual-editor/protocol";
import type { SourceResolver } from "@agent-visual-editor/domscribe-adapter";
import type { ActiveSessionTracker } from "./active-session.js";
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
  const queryToken = url.searchParams.get("token");
  if (typeof queryToken === "string" && queryToken.trim().length > 0) {
    return queryToken.trim();
  }
  return undefined;
}

export type BridgeRouteContext = {
  api: PluginHttpRouteApi;
  pairing: PairingStore;
  sessions: ActiveSessionTracker;
  store: VisualBatchStore;
  onBatchChanged: (agentId: string, sessionKey: string) => void;
  sourceResolver?: SourceResolver;
};

export type LiveBridgeSocket = {
  connectionId: string;
  socket: WebSocket;
  close: (code?: number, reason?: string) => void;
};

export class BridgeHub {
  private readonly sockets = new Map<string, Set<LiveBridgeSocket>>();
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 300 * 1024 });

  constructor(private readonly ctx: BridgeRouteContext) {}

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

    // Accept either full C-002 envelope or shorthand { code, extensionInstanceId, ... }.
    let normalized: unknown = body;
    if (typeof body === "object" && body !== null && !("type" in body)) {
      const record: JsonBody = { type: "pairing.complete", protocolVersion: PROTOCOL_VERSION };
      for (const [key, value] of Object.entries(body)) {
        record[key] = value;
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
      ...(this.ctx.sourceResolver !== undefined
        ? { sourceResolver: this.ctx.sourceResolver }
        : {}),
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
      void handler.handleRaw(raw).then((result) => {
        ws.send(JSON.stringify(result));
      });
    });

    ws.on("close", () => {
      stopKeepalive();
      set?.delete(live);
      if (set && set.size === 0) {
        this.sockets.delete(connection.connectionId);
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
