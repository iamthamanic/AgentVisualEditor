/**
 * Intentional OpenClaw import in extension — boundary fixture (must FAIL checker).
 * Location: scripts/fixtures/boundary-violations/extension-openclaw-import.ts
 */
import type { FeatureInvocationContext } from "openclaw/plugin-sdk/feature-plugin";

export type Bad = FeatureInvocationContext;
