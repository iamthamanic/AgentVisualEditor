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
};

export type ExtensionToBackground =
  | { type: "pair"; code: string; gatewayBaseUrl: string }
  | { type: "disconnect" }
  | { type: "set_inspect"; enabled: boolean }
  | { type: "remove_selection"; selectionId: string }
  | { type: "get_status" };

export type BackgroundToUi = {
  type: "status";
  connection: ConnectionState;
  chat: ActiveChatTarget;
  domscribe: DomscribeUiState;
  inspectEnabled: boolean;
  lastSelectionId: string | null;
  lastError: string | null;
  paired: boolean;
};

export type ContentToBackground =
  | { type: "selection_captured"; selection: CapturedSelection }
  | {
      type: "inspect_limitation";
      code?: NonNullable<CapturedElement["limitation"]>;
      message: string;
    };

export type BackgroundToContent =
  | { type: "inspect_set"; enabled: boolean };
