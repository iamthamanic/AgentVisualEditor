/**
 * Extension package public exports (testable helpers).
 * Location: packages/extension/src/index.ts
 */

export { buildSelector, captureElement, truncate } from "./content/capture.js";
export { nextBackoffMs, resetBackoff } from "./shared/reconnect.js";
export { assertAllowedGatewayUrl } from "./bridge/client.js";
export const EXTENSION_STATUS: "slc-2" = "slc-2";
