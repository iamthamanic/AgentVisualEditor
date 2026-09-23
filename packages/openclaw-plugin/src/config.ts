/**
 * Plugin config flags (composer UI + debug test selection).
 * Location: packages/openclaw-plugin/src/config.ts
 */

export type AvePluginConfig = {
  composerUiEnabled: boolean;
  testSelectionEnabled: boolean;
};

export const DEFAULT_AVE_CONFIG: AvePluginConfig = {
  composerUiEnabled: true,
  testSelectionEnabled: false,
};

export function readAveConfig(raw: Record<string, unknown> | undefined): AvePluginConfig {
  const composerUiEnabled = raw?.composerUiEnabled;
  const testSelectionEnabled = raw?.testSelectionEnabled;
  return {
    composerUiEnabled: typeof composerUiEnabled === "boolean" ? composerUiEnabled : DEFAULT_AVE_CONFIG.composerUiEnabled,
    testSelectionEnabled:
      typeof testSelectionEnabled === "boolean" ? testSelectionEnabled : DEFAULT_AVE_CONFIG.testSelectionEnabled,
  };
}
