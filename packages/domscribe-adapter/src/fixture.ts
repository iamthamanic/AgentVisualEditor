/**
 * Known Domscribe fixture entries for T-024 / SCN-009 (PRD §18).
 * Location: packages/domscribe-adapter/src/fixture.ts
 */

import { createMemoryLookup } from "./memory-lookup.js";
import type { DomscribeLookup, DomscribeManifestEntry } from "./types.js";

/** PRD VisualSelection example: OrderButton @ A81F09 */
export const DOMSCRIBE_FIXTURE_ENTRIES: Record<string, DomscribeManifestEntry> = {
  A81F09: {
    id: "A81F09",
    file: "src/features/order/OrderButton.tsx",
    line: 42,
    column: 5,
    component: "OrderButton",
    fileHash: "fixturehash01",
  },
  B42C17: {
    id: "B42C17",
    file: "src/features/pricing/PricingCard.tsx",
    line: 81,
    column: 2,
    component: "PricingCard",
    fileHash: "fixturehash02",
  },
};

export function fixtureLookup(): DomscribeLookup {
  return createMemoryLookup(DOMSCRIBE_FIXTURE_ENTRIES);
}
