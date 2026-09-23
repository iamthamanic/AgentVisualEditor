/**
 * Plugin config flags (composer UI, debug selection, Domscribe, preview editing, agent apply).
 * Location: packages/openclaw-plugin/src/config.ts
 */

export type AvePluginConfig = {
  composerUiEnabled: boolean;
  testSelectionEnabled: boolean;
  /** Auto: attempt resolve when relay URL or injected lookup is available. */
  domscribeEnabled: boolean;
  /** Optional Domscribe relay base URL (e.g. http://127.0.0.1:PORT). */
  domscribeRelayUrl: string | null;
  /** Design-tab / C-009 / VisualChange updates (SLC-5). */
  previewEditingEnabled: boolean;
  /**
   * C-015 agent apply_preview (SLC-6). Default false until security tests pass (§19).
   */
  agentPreviewApplyEnabled: boolean;
};

export const DEFAULT_AVE_CONFIG: AvePluginConfig = {
  composerUiEnabled: true,
  testSelectionEnabled: false,
  domscribeEnabled: true,
  domscribeRelayUrl: null,
  previewEditingEnabled: true,
  agentPreviewApplyEnabled: false,
};

export function readAveConfig(raw: Record<string, unknown> | undefined): AvePluginConfig {
  const composerUiEnabled = raw?.composerUiEnabled;
  const testSelectionEnabled = raw?.testSelectionEnabled;
  const domscribeEnabled = raw?.domscribeEnabled;
  const domscribeRelayUrl = raw?.domscribeRelayUrl;
  const previewEditingEnabled = raw?.previewEditingEnabled;
  const agentPreviewApplyEnabled = raw?.agentPreviewApplyEnabled;
  return {
    composerUiEnabled: typeof composerUiEnabled === "boolean" ? composerUiEnabled : DEFAULT_AVE_CONFIG.composerUiEnabled,
    testSelectionEnabled:
      typeof testSelectionEnabled === "boolean" ? testSelectionEnabled : DEFAULT_AVE_CONFIG.testSelectionEnabled,
    domscribeEnabled: typeof domscribeEnabled === "boolean" ? domscribeEnabled : DEFAULT_AVE_CONFIG.domscribeEnabled,
    domscribeRelayUrl:
      typeof domscribeRelayUrl === "string" && domscribeRelayUrl.trim().length > 0
        ? domscribeRelayUrl.trim()
        : null,
    previewEditingEnabled:
      typeof previewEditingEnabled === "boolean"
        ? previewEditingEnabled
        : DEFAULT_AVE_CONFIG.previewEditingEnabled,
    agentPreviewApplyEnabled:
      typeof agentPreviewApplyEnabled === "boolean"
        ? agentPreviewApplyEnabled
        : DEFAULT_AVE_CONFIG.agentPreviewApplyEnabled,
  };
}
