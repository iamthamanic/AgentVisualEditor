/**
 * AgentVisualEditor OpenClaw feature plugin entry (SLC-1).
 * Location: packages/openclaw-plugin/src/index.ts
 *
 * INV-1: chip ops never send. INV-3: session binding fail-closed.
 * No agent tools in SLC-1.
 */

import { defineFeaturePlugin, type FeatureInvocationContext } from "openclaw/plugin-sdk/feature-plugin";
import { buildJsonPluginConfigSchema } from "openclaw/plugin-sdk/plugin-entry";
import {
  InvalidBatchStateError,
  LimitReachedError,
  PayloadTooLargeError,
  type SourceContext,
} from "@agent-visual-editor/core";
import { contract } from "./contract.js";
import { readAveConfig } from "./config.js";
import { toBatchDto, type BatchDto } from "./project-batch.js";
import { bindSessionIdentity } from "./session-binding.js";
import { VisualBatchStore } from "./store.js";

const SESSION_EXT_NAMESPACE = "visualBatch";

type OpErrorCode =
  | "no_session_context"
  | "forbidden"
  | "not_found"
  | "limit_reached"
  | "payload_too_large"
  | "invalid_batch_state";

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
  description: "Native composer chips and session-bound visual context for AgentVisualEditor.",
  setup(api, events) {
    const store = new VisualBatchStore();
    const config = readAveConfig(api.pluginConfig);

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
        }
      },
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

    function emitChanged(agentId: string, sessionKey: string) {
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

      get_ui_flags() {
        return {
          composerUiEnabled: config.composerUiEnabled,
          testSelectionEnabled: config.testSelectionEnabled,
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
