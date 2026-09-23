/**
 * Domscribe SourceResolver adapter — data-ds → SourceContext (C-017).
 * Location: packages/domscribe-adapter/src/index.ts
 *
 * INV-5/6: depends only on core. Never throws into product paths (FR-012).
 */

export type {
  DomscribeLookup,
  DomscribeManifestEntry,
  DomscribeUiStatus,
  ResolveRequest,
  SourceResolver,
  SourceResolverOptions,
} from "./types.js";
export {
  DOMSCRIBE_STATUS_LABELS_DE,
  statusLabelDe,
} from "./status-labels.js";
export { createPageStatusStore, type PageStatusStore } from "./page-status.js";
export { createMemoryLookup } from "./memory-lookup.js";
export { createHttpRelayLookup, DEFAULT_RELAY_HEALTH_TIMEOUT_MS } from "./http-lookup.js";
export { validateDomscribeRelayUrl, type RelayUrlValidation } from "./relay-url.js";
export { createSourceResolver } from "./resolver.js";
export { DOMSCRIBE_FIXTURE_ENTRIES, fixtureLookup } from "./fixture.js";
