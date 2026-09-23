/**
 * Active OpenClaw session tracker for C-005 (fail-closed targeting).
 * Location: packages/openclaw-plugin/src/active-session.ts
 */

import type { ActiveSessionChanged } from "@agent-visual-editor/protocol";
import { PROTOCOL_VERSION } from "@agent-visual-editor/protocol";

export type ActiveSessionSnapshot = {
  sessionKey: string | null;
  agentId: string | null;
  title: string | null;
  status: "active" | "none" | "ambiguous";
  revision: number;
};

export type ActiveSessionListener = (event: ActiveSessionChanged) => void;

export class ActiveSessionTracker {
  private snapshot: ActiveSessionSnapshot = {
    sessionKey: null,
    agentId: null,
    title: null,
    status: "none",
    revision: 0,
  };
  private readonly listeners = new Set<ActiveSessionListener>();
  private previewEditingEnabled = true;

  setPreviewEditingEnabled(enabled: boolean): void {
    this.previewEditingEnabled = enabled;
  }

  get(): ActiveSessionSnapshot {
    return { ...this.snapshot };
  }

  hasExactSession(): boolean {
    return (
      this.snapshot.status === "active" &&
      typeof this.snapshot.sessionKey === "string" &&
      this.snapshot.sessionKey.length > 0 &&
      typeof this.snapshot.agentId === "string" &&
      this.snapshot.agentId.length > 0
    );
  }

  requireExact():
    | { ok: true; sessionKey: string; agentId: string }
    | { ok: false; code: "no_active_session"; message: string } {
    if (!this.hasExactSession() || this.snapshot.sessionKey === null || this.snapshot.agentId === null) {
      return {
        ok: false,
        code: "no_active_session",
        message: "Kein aktiver OpenClaw-Chat — Chip kann nicht angehängt werden",
      };
    }
    return {
      ok: true,
      sessionKey: this.snapshot.sessionKey,
      agentId: this.snapshot.agentId,
    };
  }

  report(input: {
    sessionKey?: string | null;
    agentId?: string | null;
    title?: string | null;
    ambiguous?: boolean;
  }): ActiveSessionChanged {
    const sessionKey =
      typeof input.sessionKey === "string" && input.sessionKey.trim().length > 0
        ? input.sessionKey.trim()
        : null;
    const agentId =
      typeof input.agentId === "string" && input.agentId.trim().length > 0
        ? input.agentId.trim()
        : null;
    const title =
      typeof input.title === "string" && input.title.trim().length > 0 ? input.title.trim() : null;

    let status: ActiveSessionSnapshot["status"] = "none";
    if (input.ambiguous === true) {
      status = "ambiguous";
    } else if (sessionKey && agentId) {
      status = "active";
    }

    const unchanged =
      this.snapshot.sessionKey === sessionKey &&
      this.snapshot.agentId === agentId &&
      this.snapshot.title === title &&
      this.snapshot.status === status;
    if (unchanged) {
      return this.toEvent();
    }

    this.snapshot = {
      sessionKey,
      agentId,
      title,
      status,
      revision: this.snapshot.revision + 1,
    };
    const event = this.toEvent();
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  subscribe(listener: ActiveSessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  toEvent(): ActiveSessionChanged {
    return {
      type: "activeSession.changed",
      protocolVersion: PROTOCOL_VERSION,
      revision: this.snapshot.revision,
      sessionKey: this.snapshot.sessionKey,
      agentId: this.snapshot.agentId,
      title: this.snapshot.title,
      status: this.snapshot.status,
      previewEditingEnabled: this.previewEditingEnabled,
    };
  }
}
