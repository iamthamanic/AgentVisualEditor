/**
 * AgentVisualEditor OpenClaw feature plugin entry (SLC-1..SLC-4).
 * Location: packages/openclaw-plugin/src/index.ts
 *
 * INV-1: chip ops never send. INV-3: session binding fail-closed.
 * INV-4: plugin-scoped pairing only.
 * SLC-3: prepare_send/send_outcome + next-turn injection + agent tools.
 * SLC-4: Domscribe SourceResolver on selection path (degraded when absent).
 */

import { defineFeaturePlugin, type FeatureInvocationContext } from "openclaw/plugin-sdk/feature-plugin";
import { buildJsonPluginConfigSchema } from "openclaw/plugin-sdk/plugin-entry";
import {
  InvalidBatchStateError,
  LimitReachedError,
  PayloadTooLargeError,
  type SourceContext,
} from "@agent-visual-editor/core";
import {
  createHttpRelayLookup,
  createSourceResolver,
  type SourceResolver,
} from "@agent-visual-editor/domscribe-adapter";
import { PROTOCOL_VERSION } from "@agent-visual-editor/protocol";
import { ActiveSessionTracker } from "./active-session.js";
import { registerBridgeRoutes, type BridgeHub } from "./bridge-routes.js";
import { contract } from "./contract.js";
import { readAveConfig } from "./config.js";
import { BRIDGE_PATH, PairingStore } from "./pairing.js";
import { toBatchDto, type BatchDto } from "./project-batch.js";
import { bindSessionIdentity } from "./session-binding.js";
import { VisualBatchStore } from "./store.js";
import { toActiveContextDto, toSelectionDetailDto } from "./tool-payloads.js";

const SESSION_EXT_NAMESPACE = "visualBatch";

function buildSourceResolver(config: ReturnType<typeof readAveConfig>): SourceResolver {
  if (!config.domscribeEnabled) {
    return createSourceResolver({ enabled: false });
  }
  if (config.domscribeRelayUrl) {
    return createSourceResolver({
      enabled: true,
      lookup: createHttpRelayLookup({ baseUrl: config.domscribeRelayUrl }),
    });
  }
  // Auto without relay URL: degraded until URL configured or tests inject a lookup.
  return createSourceResolver({ enabled: true });
}

type OpErrorCode =
  | "no_session_context"
  | "forbidden"
  | "not_found"
  | "limit_reached"
  | "payload_too_large"
  | "invalid_batch_state"
  | "rate_limited"
  | "invalid_code"
  | "expired_code"
  | "incompatible_protocol"
  | "no_active_session"
  | "stale_batch"
  | "stale_preparation"
  | "unavailable_context"
  | "no_context"
  | "expired";

type OpError = {
  ok: false;
  code: OpErrorCode;
  message: string;
};

type OpOkBatch = {
  ok: true;
  batch: BatchDto;
};

function opError(code: OpErrorCode, message: string): OpError {
  return { ok: false, code, message };
}

function contextIdentity(context: FeatureInvocationContext): {
  sessionKey?: string;
  agentId?: string;
} {
  if (context.source === "session-action") {
    return {
      sessionKey: context.action.sessionKey,
      agentId: context.action.agentId,
    };
  }
  if (context.source === "tool") {
    return {
      sessionKey: context.tool.sessionKey,
      agentId: context.tool.agentId,
    };
  }
  return {};
}

function buildTestSource(input: {
  component?: string;
  file?: string;
  line?: number;
}): SourceContext | undefined {
  if (!input.component && !input.file) {
    return undefined;
  }
  const source: SourceContext = {
    resolver: "manual",
    freshness: "fresh",
  };
  if (input.component !== undefined) {
    source.component = input.component;
  }
  if (input.file !== undefined) {
    source.file = input.file;
  }
  if (input.line !== undefined) {
    source.line = input.line;
  }
  return source;
}

const plugin = defineFeaturePlugin({
  contract,
  name: "Agent Visual Editor",
  description:
    "Native composer chips, pairing, extension bridge, send context, and agent tools for AgentVisualEditor.",
  setup(api, events) {
    const store = new VisualBatchStore();
    const pairing = new PairingStore();
    const sessions = new ActiveSessionTracker();
    const config = readAveConfig(api.pluginConfig);
    const sourceResolver = buildSourceResolver(config);

    let bridgeHub: BridgeHub | undefined;

    const emitChanged = (agentId: string, sessionKey: string) => {
      const batch = store.getOrCreate(agentId, sessionKey);
      try {
        events.emit("visual_batch_changed", {
          sessionKey,
          agentId,
          batch: toBatchDto(batch),
        });
      } catch {
        // Emitter unavailable until gateway service starts — safe for unit tests.
      }
    };

    bridgeHub = registerBridgeRoutes({
      api,
      pairing,
      sessions,
      store,
      onBatchChanged: emitChanged,
      sourceResolver,
    });

    sessions.subscribe((event) => {
      bridgeHub?.broadcastSession(event);
    });

    api.session.state.registerSessionExtension({
      namespace: SESSION_EXT_NAMESPACE,
      description: "AgentVisualEditor draft visual batch projection",
      project(ctx) {
        const batch = store.findBySessionKey(ctx.sessionKey);
        if (!batch) {
          return { state: "empty", selectionCount: 0, selections: [] };
        }
        return store.project(batch.agentId, batch.sessionKey);
      },
      cleanup(ctx) {
        if (!ctx.sessionKey) {
          return;
        }
        const batch = store.findBySessionKey(ctx.sessionKey);
        if (batch) {
          store.deleteSession(batch.agentId, batch.sessionKey);
          return;
        }
        const admitted = store.findAdmittedBySessionKey(ctx.sessionKey);
        if (admitted) {
          store.deleteSession(admitted.agentId, admitted.sessionKey);
        }
      },
    });

    // Fallback when mountDefault owns Send: inject only if the turn actually runs (RISK-004).
    api.on("agent_turn_prepare", (_event, ctx) => {
      const sessionKey = ctx.sessionKey?.trim();
      const agentId = ctx.agentId?.trim();
      if (!sessionKey || !agentId) {
        return;
      }
      const admitted = store.admitDraftForTurn(agentId, sessionKey);
      if (!admitted) {
        return;
      }
      emitChanged(agentId, sessionKey);
      return { prependContext: admitted.compactContext };
    });

    function resolveBinding(
      input: { sessionKey: string; agentId: string },
      context: FeatureInvocationContext,
    ) {
      const ctx = contextIdentity(context);
      return bindSessionIdentity({
        requestedSessionKey: input.sessionKey,
        requestedAgentId: input.agentId,
        contextSessionKey: ctx.sessionKey,
        contextAgentId: ctx.agentId,
      });
    }

    function resolveToolBinding(context: FeatureInvocationContext) {
      const ctx = contextIdentity(context);
      return bindSessionIdentity({
        contextSessionKey: ctx.sessionKey,
        contextAgentId: ctx.agentId,
      });
    }

    return {
      get_visual_batch(input, context): OpOkBatch | OpError {
        const binding = resolveBinding(input, context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        const batch = store.snapshot(binding.identity.agentId, binding.identity.sessionKey);
        return { ok: true, batch: toBatchDto(batch) };
      },

      attach_test_selection(input, context): (OpOkBatch & { selectionId: string; deduped: boolean }) | OpError {
        if (!config.testSelectionEnabled) {
          return opError("forbidden", "Test-Selektion ist deaktiviert (testSelectionEnabled=false)");
        }
        const binding = resolveBinding(input, context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        try {
          const result = store.attach(binding.identity.agentId, binding.identity.sessionKey, {
            pageUrl: "ave://test-selection",
            pageTitle: "Test-Selektion",
            tag: input.tag ?? "div",
            textSummary: input.textSummary ?? "Test-Element",
            selector: input.selector ?? "#ave-test-selection",
            source: buildTestSource(input),
          });
          emitChanged(binding.identity.agentId, binding.identity.sessionKey);
          return {
            ok: true,
            batch: toBatchDto(result.batch),
            selectionId: result.selection.id,
            deduped: result.deduped,
          };
        } catch (error) {
          if (error instanceof LimitReachedError) {
            return opError("limit_reached", error.message);
          }
          if (error instanceof PayloadTooLargeError) {
            return opError("payload_too_large", error.message);
          }
          if (error instanceof InvalidBatchStateError) {
            return opError("invalid_batch_state", error.message);
          }
          throw error;
        }
      },

      remove_selection(input, context): OpOkBatch | OpError {
        const binding = resolveBinding(input, context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        const before = store.get(binding.identity.agentId, binding.identity.sessionKey);
        const existed = before?.selections.some((s) => s.id === input.selectionId) ?? false;
        if (!existed) {
          return opError("not_found", "Selektion nicht gefunden");
        }
        const batch = store.remove(binding.identity.agentId, binding.identity.sessionKey, input.selectionId);
        emitChanged(binding.identity.agentId, binding.identity.sessionKey);
        return { ok: true, batch: toBatchDto(batch) };
      },

      clear_visual_batch(input, context): OpOkBatch | OpError {
        const binding = resolveBinding(input, context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        const batch = store.clear(binding.identity.agentId, binding.identity.sessionKey);
        emitChanged(binding.identity.agentId, binding.identity.sessionKey);
        return { ok: true, batch: toBatchDto(batch) };
      },

      prepare_send(input, context) {
        const binding = resolveBinding(input, context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        const result = store.prepareSend(
          binding.identity.agentId,
          binding.identity.sessionKey,
          input.expectedRevision,
        );
        if (!result.ok) {
          return opError(result.code, result.message);
        }
        emitChanged(binding.identity.agentId, binding.identity.sessionKey);
        return {
          ok: true as const,
          preparationId: result.preparationId,
          revision: result.revision,
          batch: toBatchDto(result.batch),
          compactContext: result.compactContext,
        };
      },

      async send_outcome(input, context) {
        const binding = resolveBinding(input, context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        const result = store.completeSend(
          binding.identity.agentId,
          binding.identity.sessionKey,
          input.preparationId,
          input.admitted,
        );
        if (!result.ok) {
          return opError(result.code, result.message);
        }

        let injectionEnqueued = false;
        if (result.admitted && result.compactContext) {
          try {
            const enqueued = await api.session.workflow.enqueueNextTurnInjection({
              sessionKey: binding.identity.sessionKey,
              agentId: binding.identity.agentId,
              text: result.compactContext,
              idempotencyKey: input.preparationId,
              placement: "prepend_context",
              ttlMs: 120_000,
              metadata: {
                preparationId: input.preparationId,
                plugin: "agent-visual-editor",
              },
            });
            injectionEnqueued = enqueued.enqueued;
          } catch {
            // Host may be unavailable in unit tests; store archive still holds context for tools.
            injectionEnqueued = false;
          }
        }

        emitChanged(binding.identity.agentId, binding.identity.sessionKey);
        return {
          ok: true as const,
          state: result.state,
          admitted: result.admitted,
          batch: toBatchDto(result.batch),
          injectionEnqueued,
        };
      },

      get_active_context(input, context) {
        const binding = resolveToolBinding(context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        const batch = store.getActiveContextBatch(
          binding.identity.agentId,
          binding.identity.sessionKey,
        );
        if (!batch) {
          return opError("no_context", "Kein aktiver Visual-Kontext für diese Session");
        }
        if (input.batchId && input.batchId !== batch.id) {
          return opError("forbidden", "Cross-Batch-Zugriff verweigert");
        }
        return {
          ok: true as const,
          context: toActiveContextDto(batch),
        };
      },

      get_selection(input, context) {
        const binding = resolveToolBinding(context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        const batch = store.getActiveContextBatch(
          binding.identity.agentId,
          binding.identity.sessionKey,
        );
        if (!batch) {
          return opError("not_found", "Selektion nicht gefunden");
        }
        const selection = batch.selections.find((item) => item.id === input.selectionId);
        if (!selection) {
          return opError("not_found", "Selektion nicht gefunden");
        }
        return {
          ok: true as const,
          selection: toSelectionDetailDto(batch, selection),
        };
      },

      get_screenshot(_input, context) {
        const binding = resolveToolBinding(context);
        if (!binding.ok) {
          return opError(binding.code, binding.message);
        }
        // SLC-5 will deliver artifacts; fail closed until then (C-014 stub).
        return opError(
          "not_found",
          "Kein Screenshot-Artifact verfügbar (noch nicht hochgeladen oder abgelaufen)",
        );
      },

      get_ui_flags() {
        return {
          composerUiEnabled: config.composerUiEnabled,
          testSelectionEnabled: config.testSelectionEnabled,
        };
      },

      pairing_start(input) {
        const result = pairing.start(input.label);
        if (!result.ok) {
          return opError(result.code, result.message);
        }
        return result;
      },

      connection_revoke(input) {
        const result = pairing.revoke(input.connectionId);
        if (!result.ok) {
          return opError(result.code, result.message);
        }
        bridgeHub?.terminateConnection(input.connectionId);
        return result;
      },

      list_connections() {
        return {
          ok: true as const,
          connections: pairing.listConnections().map((c) => ({
            connectionId: c.connectionId,
            extensionInstanceId: c.extensionInstanceId,
            extensionLabel: c.extensionLabel ?? null,
            createdAtMs: c.createdAtMs,
            revoked: c.revoked,
          })),
        };
      },

      report_active_session(input) {
        const event = sessions.report({
          sessionKey: input.sessionKey ?? null,
          agentId: input.agentId ?? null,
          title: input.title ?? null,
          ambiguous: input.ambiguous,
        });
        return {
          ok: true as const,
          revision: event.revision,
          status: event.status,
          sessionKey: event.sessionKey,
          agentId: event.agentId,
          title: event.title ?? null,
        };
      },

      get_health() {
        const snap = sessions.get();
        const active = pairing.listConnections().filter((c) => !c.revoked);
        return {
          ok: true as const,
          pluginInstalled: true as const,
          bridgePath: BRIDGE_PATH,
          pairedConnectionCount: active.length,
          activeSessionAvailable: sessions.hasExactSession(),
          activeSessionStatus: snap.status,
          domscribeStatus: sourceResolver.lastStatus(),
          protocolVersion: PROTOCOL_VERSION,
        };
      },
    };
  },
});

const aveConfigSchema = buildJsonPluginConfigSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    composerUiEnabled: {
      type: "boolean",
      default: true,
      description: "Enable composer chip region replacement.",
    },
    testSelectionEnabled: {
      type: "boolean",
      default: false,
      description: "Show debug Test-Selektion button in the composer.",
    },
    domscribeEnabled: {
      type: "boolean",
      default: true,
      description: "Attempt Domscribe source resolve when a relay URL is configured (auto).",
    },
    domscribeRelayUrl: {
      type: "string",
      description: "Optional Domscribe relay base URL (http://127.0.0.1:PORT).",
    },
  },
});

Object.defineProperty(plugin, "configSchema", {
  get() {
    return aveConfigSchema;
  },
  enumerable: true,
  configurable: true,
});

for (const symbol of Object.getOwnPropertySymbols(plugin)) {
  const metadata = Reflect.get(plugin, symbol);
  if (metadata !== null && typeof metadata === "object" && "configSchema" in metadata) {
    Reflect.set(metadata, "configSchema", {
      type: "object",
      additionalProperties: false,
      properties: {
        composerUiEnabled: {
          type: "boolean",
          default: true,
          description: "Enable composer chip region replacement.",
        },
        testSelectionEnabled: {
          type: "boolean",
          default: false,
          description: "Show debug Test-Selektion button in the composer.",
        },
        domscribeEnabled: {
          type: "boolean",
          default: true,
          description: "Attempt Domscribe source resolve when a relay URL is configured (auto).",
        },
        domscribeRelayUrl: {
          type: "string",
          description: "Optional Domscribe relay base URL (http://127.0.0.1:PORT).",
        },
      },
    });
  }
}

export default plugin;

export { VisualBatchStore } from "./store.js";
export { bindSessionIdentity } from "./session-binding.js";
export { toBatchDto } from "./project-batch.js";
export { readAveConfig, DEFAULT_AVE_CONFIG } from "./config.js";
export { contract } from "./contract.js";
export { PairingStore, BRIDGE_PATH, PAIRING_COMPLETE_PATH } from "./pairing.js";
export { ActiveSessionTracker } from "./active-session.js";
export { BridgeMessageHandler } from "./bridge-handler.js";
export { toActiveContextDto, toSelectionDetailDto } from "./tool-payloads.js";
export { buildCompactNextTurnContext } from "@agent-visual-editor/core";
