/**
 * Shared extension types and message envelopes (German UI codes).
 * Location: packages/extension/src/shared/types.ts
 */

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "re_pair_required";

export type DomscribeUiState = "unavailable" | "available" | "stale" | "error";

export type ActiveChatTarget = {
  sessionKey: string | null;
  agentId: string | null;
  title: string | null;
  status: "active" | "none" | "ambiguous";
  revision: number;
};

export type PairingConfig = {
  gatewayBaseUrl: string;
  connectionId: string;
  token: string;
  extensionInstanceId: string;
};

export type CapturedElement = {
  tag: string;
  textSummary?: string;
  selector: string;
  dataDs?: string;
  box?: { x: number; y: number; width: number; height: number };
  limitation?: "shadow_closed" | "cross_origin_iframe" | "permission_denied";
};

export type CapturedSelection = {
  page: { url: string; title?: string };
  element: CapturedElement;
  tabId?: string;
  /** window.devicePixelRatio at capture time (for preview crop). */
  devicePixelRatio?: number;
};

export type VisualChangePayload = {
  id: string;
  kind: "style" | "text" | "attribute" | "comment" | "other";
  property?: string;
  path?: string;
  oldValue?: string;
  newValue?: string;
  status: "pending" | "in_progress" | "resolved" | "reverted";
};

export type ArtifactUploadPayload = {
  selectionId: string;
  mime: "image/png";
  width: number;
  height: number;
  byteSize: number;
  pngBase64: string;
  contentHash?: string;
  kind?: "viewport" | "element";
  pageUrl?: string;
  capturedAt?: string;
};

export type ExtensionToBackground =
  | { type: "pair"; code: string; gatewayBaseUrl: string }
  | { type: "disconnect" }
  | { type: "set_inspect"; enabled: boolean }
  | { type: "remove_selection"; selectionId: string }
  | { type: "get_status" }
  | { type: "selection_preview_retry" }
  | {
      type: "selection_preview_result";
      selectionId: string;
      ok: boolean;
      previewDataUrl?: string;
      message?: string;
    }
  | {
      type: "preview_edit";
      selectionId: string;
      selector: string;
      change: VisualChangePayload;
      apply:
        | { kind: "style"; property: string; value: string }
        | { kind: "text"; value: string }
        | { kind: "comment" };
    }
  | {
      type: "preview_revert";
      selectionId: string;
      selector: string;
      change: VisualChangePayload;
    }
  | {
      type: "preview_clear";
      selectionId: string;
      selector: string;
      changes: VisualChangePayload[];
    }
  | {
      type: "capture_screenshot";
      selectionId: string;
      kind: "viewport" | "element";
      pageUrl?: string;
      box?: { x: number; y: number; width: number; height: number };
    };

export type LastSelectionSummary = {
  id: string;
  tag: string;
  selector: string;
  pageUrl: string;
  pageTitle?: string;
  textSummary?: string;
  box?: { x: number; y: number; width: number; height: number };
  /** Cropped element PNG as data URL for side-panel preview. */
  previewDataUrl?: string;
  previewStatus?: "pending" | "ready" | "failed";
  previewError?: string;
  devicePixelRatio?: number;
  /** True when selection was acknowledged by OpenClaw bridge. */
  synced: boolean;
};

/** One-shot viewport frame for the side panel to crop locally. */
export type SelectionPreviewFrame = {
  type: "selection_preview_frame";
  selectionId: string;
  viewportDataUrl: string;
  box: { x: number; y: number; width: number; height: number };
  devicePixelRatio: number;
};

export type BackgroundToUi = {
  type: "status";
  connection: ConnectionState;
  chat: ActiveChatTarget;
  domscribe: DomscribeUiState;
  inspectEnabled: boolean;
  lastSelectionId: string | null;
  lastSelector: string | null;
  lastSelection: LastSelectionSummary | null;
  lastError: string | null;
  paired: boolean;
  previewEditingEnabled: boolean;
  lastArtifactId: string | null;
};

export type BackgroundPush = BackgroundToUi | SelectionPreviewFrame;

export type ContentToBackground =
  | { type: "selection_captured"; selection: CapturedSelection }
  | { type: "content_ready" }
  | {
      type: "inspect_limitation";
      code?: NonNullable<CapturedElement["limitation"]>;
      message: string;
    };

export type BackgroundToContent =
  | { type: "inspect_set"; enabled: boolean };
