/**
 * In-memory screenshot artifact store with TTL and content-hash dedupe (C-009 / FR-018).
 * Location: packages/openclaw-plugin/src/artifact-store.ts
 */

import {
  ARTIFACT_TTL_MS,
  SCREENSHOT_MAX_BYTES,
  type ScreenshotArtifactMeta,
} from "@agent-visual-editor/core";
import { createHash } from "node:crypto";

export const ARTIFACT_MAX_GLOBAL = 50;
export const ARTIFACT_MAX_PER_SESSION = 10;

export type StoredScreenshotArtifact = ScreenshotArtifactMeta & {
  agentId: string;
  sessionKey: string;
  png: Buffer;
};

export type ArtifactPutInput = {
  selectionId: string;
  agentId: string;
  sessionKey: string;
  width: number;
  height: number;
  png: Buffer;
  kind: "viewport" | "element";
  pageUrl: string;
  capturedAt?: string;
  contentHash?: string;
  nowMs?: number;
  ttlMs?: number;
};

export type ArtifactPutResult =
  | { ok: true; artifact: StoredScreenshotArtifact; deduped: boolean }
  | { ok: false; code: "too_large" | "invalid_type" | "limit_reached"; message: string };

function hashPng(png: Buffer): string {
  return createHash("sha256").update(png).digest("hex");
}

export class ArtifactStore {
  private readonly byId = new Map<string, StoredScreenshotArtifact>();
  private readonly byHashKey = new Map<string, string>();

  private purgeExpired(nowMs: number): void {
    for (const [id, artifact] of this.byId) {
      if (Date.parse(artifact.expiresAt) <= nowMs) {
        this.byId.delete(id);
      }
    }
    for (const [key, id] of this.byHashKey) {
      if (!this.byId.has(id)) {
        this.byHashKey.delete(key);
      }
    }
  }

  private countForSession(agentId: string, sessionKey: string): number {
    let n = 0;
    for (const artifact of this.byId.values()) {
      if (artifact.agentId === agentId && artifact.sessionKey === sessionKey) {
        n += 1;
      }
    }
    return n;
  }

  put(input: ArtifactPutInput): ArtifactPutResult {
    if (input.png.byteLength === 0) {
      return { ok: false, code: "invalid_type", message: "PNG-Body fehlt" };
    }
    if (input.png.byteLength > SCREENSHOT_MAX_BYTES) {
      return {
        ok: false,
        code: "too_large",
        message: `Screenshot überschreitet ${SCREENSHOT_MAX_BYTES} Bytes`,
      };
    }
    // PNG magic bytes
    if (
      input.png.byteLength < 8 ||
      input.png[0] !== 0x89 ||
      input.png[1] !== 0x50 ||
      input.png[2] !== 0x4e ||
      input.png[3] !== 0x47
    ) {
      return { ok: false, code: "invalid_type", message: "Nur image/png erlaubt" };
    }

    const now = input.nowMs ?? Date.now();
    this.purgeExpired(now);

    const ttl = input.ttlMs ?? ARTIFACT_TTL_MS;
    const contentHash = input.contentHash ?? hashPng(input.png);
    const hashKey = `${input.agentId}::${input.sessionKey}::${input.selectionId}::${contentHash}`;
    const existingId = this.byHashKey.get(hashKey);
    if (existingId) {
      const existing = this.byId.get(existingId);
      if (existing && Date.parse(existing.expiresAt) > now) {
        return { ok: true, artifact: existing, deduped: true };
      }
      this.byHashKey.delete(hashKey);
      if (existing) {
        this.byId.delete(existingId);
      }
    }

    if (this.byId.size >= ARTIFACT_MAX_GLOBAL) {
      return {
        ok: false,
        code: "limit_reached",
        message: `Maximal ${ARTIFACT_MAX_GLOBAL} Artifacts erlaubt`,
      };
    }
    if (this.countForSession(input.agentId, input.sessionKey) >= ARTIFACT_MAX_PER_SESSION) {
      return {
        ok: false,
        code: "limit_reached",
        message: `Maximal ${ARTIFACT_MAX_PER_SESSION} Artifacts pro Session erlaubt`,
      };
    }

    const id = `ave_art_${crypto.randomUUID().replace(/-/g, "")}`;
    const capturedAt = input.capturedAt ?? new Date(now).toISOString();
    const artifact: StoredScreenshotArtifact = {
      id,
      selectionId: input.selectionId,
      agentId: input.agentId,
      sessionKey: input.sessionKey,
      mime: "image/png",
      width: input.width,
      height: input.height,
      byteSize: input.png.byteLength,
      contentHash,
      kind: input.kind,
      pageUrl: input.pageUrl,
      capturedAt,
      expiresAt: new Date(now + ttl).toISOString(),
      png: input.png,
    };
    this.byId.set(id, artifact);
    this.byHashKey.set(hashKey, id);
    return { ok: true, artifact, deduped: false };
  }

  get(artifactId: string, nowMs = Date.now()): StoredScreenshotArtifact | undefined {
    const artifact = this.byId.get(artifactId);
    if (!artifact) {
      return undefined;
    }
    if (Date.parse(artifact.expiresAt) <= nowMs) {
      this.byId.delete(artifactId);
      return undefined;
    }
    return artifact;
  }

  getForSelection(
    selectionId: string,
    agentId: string,
    sessionKey: string,
    nowMs = Date.now(),
  ): StoredScreenshotArtifact | undefined {
    let latest: StoredScreenshotArtifact | undefined;
    for (const artifact of this.byId.values()) {
      if (artifact.selectionId !== selectionId) continue;
      if (artifact.agentId !== agentId || artifact.sessionKey !== sessionKey) continue;
      if (Date.parse(artifact.expiresAt) <= nowMs) {
        this.byId.delete(artifact.id);
        continue;
      }
      if (!latest || artifact.capturedAt > latest.capturedAt) {
        latest = artifact;
      }
    }
    return latest;
  }

  deleteSession(agentId: string, sessionKey: string): void {
    for (const [id, artifact] of this.byId) {
      if (artifact.agentId === agentId && artifact.sessionKey === sessionKey) {
        this.byId.delete(id);
      }
    }
    for (const [key, id] of this.byHashKey) {
      if (!this.byId.has(id)) {
        this.byHashKey.delete(key);
      }
    }
  }

  size(): number {
    return this.byId.size;
  }
}

export function decodePngBase64(pngBase64: string): Buffer | undefined {
  try {
    const cleaned = pngBase64.includes(",")
      ? pngBase64.slice(pngBase64.indexOf(",") + 1)
      : pngBase64;
    return Buffer.from(cleaned, "base64");
  } catch {
    return undefined;
  }
}
