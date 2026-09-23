/**
 * Fail-closed session binding helpers (INV-3 / BR-003).
 * Location: packages/openclaw-plugin/src/session-binding.ts
 */

export type SessionIdentity = {
  sessionKey: string;
  agentId: string;
};

export type BindingFailure = {
  ok: false;
  code: "no_session_context" | "forbidden";
  message: string;
};

export type BindingSuccess = {
  ok: true;
  identity: SessionIdentity;
};

export type BindingResult = BindingSuccess | BindingFailure;

function nonEmpty(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolve and validate session identity. Fail closed — never guess a session.
 */
export function bindSessionIdentity(input: {
  requestedSessionKey?: string;
  requestedAgentId?: string;
  contextSessionKey?: string;
  contextAgentId?: string;
}): BindingResult {
  const sessionKey = nonEmpty(input.requestedSessionKey)
    ? input.requestedSessionKey.trim()
    : nonEmpty(input.contextSessionKey)
      ? input.contextSessionKey.trim()
      : undefined;
  const agentId = nonEmpty(input.requestedAgentId)
    ? input.requestedAgentId.trim()
    : nonEmpty(input.contextAgentId)
      ? input.contextAgentId.trim()
      : undefined;

  if (!sessionKey || !agentId) {
    return {
      ok: false,
      code: "no_session_context",
      message: "Keine gültige Session-Identität (sessionKey + agentId) verfügbar",
    };
  }

  if (nonEmpty(input.requestedSessionKey) && nonEmpty(input.contextSessionKey)) {
    if (input.requestedSessionKey.trim() !== input.contextSessionKey.trim()) {
      return {
        ok: false,
        code: "forbidden",
        message: "Cross-Session-Zugriff verweigert",
      };
    }
  }

  if (nonEmpty(input.requestedAgentId) && nonEmpty(input.contextAgentId)) {
    if (input.requestedAgentId.trim() !== input.contextAgentId.trim()) {
      return {
        ok: false,
        code: "forbidden",
        message: "Cross-Agent-Zugriff verweigert",
      };
    }
  }

  return {
    ok: true,
    identity: { sessionKey, agentId },
  };
}
