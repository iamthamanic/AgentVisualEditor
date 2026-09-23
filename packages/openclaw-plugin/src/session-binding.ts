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
 *
 * Host context (contextSessionKey + contextAgentId) is required.
 * Requested keys may only MATCH context; they never substitute when context is missing.
 */
export function bindSessionIdentity(input: {
  requestedSessionKey?: string;
  requestedAgentId?: string;
  contextSessionKey?: string;
  contextAgentId?: string;
}): BindingResult {
  if (!nonEmpty(input.contextSessionKey) || !nonEmpty(input.contextAgentId)) {
    return {
      ok: false,
      code: "no_session_context",
      message: "Keine gültige Session-Identität (sessionKey + agentId) verfügbar",
    };
  }

  const sessionKey = input.contextSessionKey.trim();
  const agentId = input.contextAgentId.trim();

  if (nonEmpty(input.requestedSessionKey)) {
    if (input.requestedSessionKey.trim() !== sessionKey) {
      return {
        ok: false,
        code: "forbidden",
        message: "Cross-Session-Zugriff verweigert",
      };
    }
  }

  if (nonEmpty(input.requestedAgentId)) {
    if (input.requestedAgentId.trim() !== agentId) {
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
