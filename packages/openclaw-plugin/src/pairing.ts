/**
 * Plugin-scoped pairing credentials (C-001..C-003). INV-4: never Gateway bearer.
 * Location: packages/openclaw-plugin/src/pairing.ts
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const BRIDGE_PATH = "/agent-visual-editor/bridge";
export const PAIRING_COMPLETE_PATH = "/agent-visual-editor/pairing/complete";
export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
export const MAX_PENDING_CODES = 8;

export type PendingPairing = {
  attemptId: string;
  codeHash: string;
  label?: string;
  expiresAtMs: number;
};

export type PairedConnection = {
  connectionId: string;
  tokenHash: string;
  extensionInstanceId: string;
  extensionLabel?: string;
  createdAtMs: number;
  revoked: boolean;
};

export type PairingStartResult = {
  ok: true;
  code: string;
  expiresAt: string;
  attemptId: string;
};

export type PairingCompleteOk = {
  ok: true;
  connectionId: string;
  token: string;
  bridgePath: string;
};

export type PairingCompleteErr = {
  ok: false;
  code: "invalid_code" | "expired_code" | "rate_limited" | "incompatible_protocol";
  message: string;
};

export type RevokeResult =
  | { ok: true; revoked: true; connectionId: string }
  | { ok: false; code: "not_found"; message: string };

function hashSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function mintCode(): string {
  // Crockford-ish alphanumeric without ambiguous chars — 8 chars.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    const b = bytes[i];
    if (b === undefined) {
      throw new Error("randomBytes underflow");
    }
    out += alphabet[b % alphabet.length];
  }
  return out;
}

function mintToken(): string {
  return `ave_${randomBytes(32).toString("base64url")}`;
}

function mintId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export class PairingStore {
  private readonly pending = new Map<string, PendingPairing>();
  private readonly connections = new Map<string, PairedConnection>();
  private readonly tokenIndex = new Map<string, string>();
  /** Global start rate limit (shared; no remote identity at start). */
  private startWindow: { startedAtMs: number; count: number } = { startedAtMs: 0, count: 0 };
  /** Complete-failure rate limit keyed by extensionInstanceId. */
  private readonly completeFailWindows = new Map<
    string,
    { startedAtMs: number; count: number }
  >();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly codeTtlMs = PAIRING_CODE_TTL_MS,
  ) {}

  private noteCompleteFailure(extensionInstanceId: string, nowMs: number): void {
    const key = extensionInstanceId.trim() || "unknown";
    let window = this.completeFailWindows.get(key);
    if (!window || nowMs - window.startedAtMs > 60_000) {
      window = { startedAtMs: nowMs, count: 0 };
      this.completeFailWindows.set(key, window);
    }
    window.count += 1;
  }

  private isCompleteRateLimited(extensionInstanceId: string, nowMs: number): boolean {
    const key = extensionInstanceId.trim() || "unknown";
    const window = this.completeFailWindows.get(key);
    if (!window) {
      return false;
    }
    if (nowMs - window.startedAtMs > 60_000) {
      this.completeFailWindows.delete(key);
      return false;
    }
    return window.count >= 10;
  }

  private resetCompleteFailures(extensionInstanceId: string, nowMs: number): void {
    const key = extensionInstanceId.trim() || "unknown";
    this.completeFailWindows.set(key, { startedAtMs: nowMs, count: 0 });
  }

  start(label?: string): PairingStartResult | PairingCompleteErr {
    const nowMs = this.now();
    if (nowMs - this.startWindow.startedAtMs > 60_000) {
      this.startWindow = { startedAtMs: nowMs, count: 0 };
    }
    this.startWindow.count += 1;
    if (this.startWindow.count > 20) {
      return { ok: false, code: "rate_limited", message: "Zu viele Pairing-Versuche — bitte warten" };
    }

    this.purgeExpired(nowMs);
    if (this.pending.size >= MAX_PENDING_CODES) {
      // Policy: new code invalidates oldest pending.
      let oldestKey: string | undefined;
      let oldestExp = Number.POSITIVE_INFINITY;
      for (const [key, pending] of this.pending) {
        if (pending.expiresAtMs < oldestExp) {
          oldestExp = pending.expiresAtMs;
          oldestKey = key;
        }
      }
      if (oldestKey !== undefined) {
        this.pending.delete(oldestKey);
      }
    }

    const code = mintCode();
    const attemptId = mintId("attempt");
    const expiresAtMs = nowMs + this.codeTtlMs;
    const entry: PendingPairing = {
      attemptId,
      codeHash: hashSecret(code),
      expiresAtMs,
    };
    if (label !== undefined) {
      entry.label = label;
    }
    this.pending.set(attemptId, entry);
    return {
      ok: true,
      code,
      expiresAt: new Date(expiresAtMs).toISOString(),
      attemptId,
    };
  }

  complete(input: {
    code: string;
    extensionInstanceId: string;
    extensionLabel?: string;
    protocolVersion: number;
  }): PairingCompleteOk | PairingCompleteErr {
    const nowMs = this.now();
    if (this.isCompleteRateLimited(input.extensionInstanceId, nowMs)) {
      return {
        ok: false,
        code: "rate_limited",
        message: "Zu viele fehlgeschlagene Pairing-Versuche — bitte warten",
      };
    }

    if (input.protocolVersion !== 1) {
      this.noteCompleteFailure(input.extensionInstanceId, nowMs);
      return {
        ok: false,
        code: "incompatible_protocol",
        message: "Protokollversion nicht unterstützt",
      };
    }
    const codeHash = hashSecret(input.code.trim().toUpperCase());
    let matchedAttemptId: string | undefined;
    for (const [attemptId, pending] of this.pending) {
      if (safeEqualHex(pending.codeHash, codeHash)) {
        matchedAttemptId = attemptId;
        break;
      }
    }
    if (matchedAttemptId === undefined) {
      this.purgeExpired(nowMs);
      this.noteCompleteFailure(input.extensionInstanceId, nowMs);
      return { ok: false, code: "invalid_code", message: "Ungültiger Pairing-Code" };
    }
    const pending = this.pending.get(matchedAttemptId);
    if (pending === undefined) {
      this.noteCompleteFailure(input.extensionInstanceId, nowMs);
      return { ok: false, code: "invalid_code", message: "Ungültiger Pairing-Code" };
    }
    this.pending.delete(matchedAttemptId);
    this.purgeExpired(nowMs);
    if (pending.expiresAtMs < nowMs) {
      this.noteCompleteFailure(input.extensionInstanceId, nowMs);
      return { ok: false, code: "expired_code", message: "Pairing-Code abgelaufen" };
    }

    // Successful complete resets this extension's failure window.
    this.resetCompleteFailures(input.extensionInstanceId, nowMs);

    const connectionId = mintId("conn");
    const token = mintToken();
    const tokenHash = hashSecret(token);
    const connection: PairedConnection = {
      connectionId,
      tokenHash,
      extensionInstanceId: input.extensionInstanceId,
      createdAtMs: nowMs,
      revoked: false,
    };
    if (input.extensionLabel !== undefined) {
      connection.extensionLabel = input.extensionLabel;
    } else if (pending.label !== undefined) {
      connection.extensionLabel = pending.label;
    }
    this.connections.set(connectionId, connection);
    this.tokenIndex.set(tokenHash, connectionId);
    return {
      ok: true,
      connectionId,
      token,
      bridgePath: BRIDGE_PATH,
    };
  }

  authenticateToken(token: string): PairedConnection | undefined {
    const connectionId = this.tokenIndex.get(hashSecret(token));
    if (connectionId === undefined) {
      return undefined;
    }
    const connection = this.connections.get(connectionId);
    if (!connection || connection.revoked) {
      return undefined;
    }
    return connection;
  }

  revoke(connectionId: string): RevokeResult {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { ok: false, code: "not_found", message: "Verbindung nicht gefunden" };
    }
    connection.revoked = true;
    this.tokenIndex.delete(connection.tokenHash);
    return { ok: true, revoked: true, connectionId };
  }

  listConnections(): Array<{
    connectionId: string;
    extensionInstanceId: string;
    extensionLabel?: string;
    createdAtMs: number;
    revoked: boolean;
  }> {
    return [...this.connections.values()].map((c) => {
      const row: {
        connectionId: string;
        extensionInstanceId: string;
        extensionLabel?: string;
        createdAtMs: number;
        revoked: boolean;
      } = {
        connectionId: c.connectionId,
        extensionInstanceId: c.extensionInstanceId,
        createdAtMs: c.createdAtMs,
        revoked: c.revoked,
      };
      if (c.extensionLabel !== undefined) {
        row.extensionLabel = c.extensionLabel;
      }
      return row;
    });
  }

  private purgeExpired(nowMs: number): void {
    for (const [id, pending] of this.pending) {
      if (pending.expiresAtMs < nowMs) {
        this.pending.delete(id);
      }
    }
  }
}
