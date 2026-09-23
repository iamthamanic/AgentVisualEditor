/**
 * Keyboard helpers — do not interfere with focused inputs (FR-032 / T-023 / EDGE-017).
 * Location: packages/extension/src/editor/keyboard.ts
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isEditableFocusTarget(target: EventTarget | null): boolean {
  if (!isRecord(target)) {
    return false;
  }
  const tag = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return target.readOnly !== true && target.disabled !== true;
  }
  if (tag === "SELECT") {
    return target.disabled !== true;
  }
  if (target.isContentEditable === true) {
    return true;
  }
  const getAttribute = target.getAttribute;
  const role =
    typeof getAttribute === "function"
      ? getAttribute.call(target, "role")
      : null;
  if (role === "textbox" || role === "searchbox" || role === "combobox") {
    return true;
  }
  return false;
}

/** True when Escape (or other inspect shortcuts) should be ignored. */
export function shouldIgnoreInspectShortcut(event: KeyboardEvent): boolean {
  return isEditableFocusTarget(event.target);
}
