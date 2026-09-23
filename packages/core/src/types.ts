/**
 * Domain types for VisualSelection / VisualBatch / VisualChange / SourceContext.
 * Location: packages/core/src/types.ts
 */

export type VisualBatchState = "draft" | "preparing" | "sent" | "cleared" | "expired";

export type SourceFreshness = "fresh" | "stale" | "unmapped" | "unavailable";

export type SourceContext = {
  resolver: "domscribe" | "none" | "manual";
  dataDs?: string;
  file?: string;
  line?: number;
  column?: number;
  component?: string;
  runtimeSummary?: unknown;
  freshness: SourceFreshness;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualChangeStatus = "pending" | "in_progress" | "resolved" | "reverted";

export type VisualChange = {
  id: string;
  kind: "style" | "text" | "attribute" | "other";
  property?: string;
  path?: string;
  oldValue?: string;
  newValue?: string;
  status: VisualChangeStatus;
};

export type VisualSelection = {
  id: string;
  capturedAt: string;
  pageUrl: string;
  pageTitle?: string;
  tabId?: string;
  tag: string;
  textSummary?: string;
  selector: string;
  box?: BoundingBox;
  domSnapshot?: string;
  source?: SourceContext;
  changes: VisualChange[];
};

export type VisualBatch = {
  id: string;
  sessionKey: string;
  agentId: string;
  state: VisualBatchState;
  createdAt: string;
  updatedAt: string;
  admittedAt?: string;
  selections: VisualSelection[];
};

export type SelectionDraftInput = {
  pageUrl: string;
  pageTitle?: string;
  tabId?: string;
  tag: string;
  textSummary?: string;
  selector: string;
  box?: BoundingBox;
  domSnapshot?: string;
  source?: Omit<SourceContext, "runtimeSummary"> & {
    runtimeSummary?: unknown;
  };
  changes?: VisualChange[];
};

export type StableIdentity = {
  tag: string;
  selector: string;
  textSummary: string;
};

export type ChipLabelParts = {
  primary: string;
  secondary?: string;
};
