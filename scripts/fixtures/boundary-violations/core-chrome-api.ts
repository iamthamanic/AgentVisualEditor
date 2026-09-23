/**
 * Intentional Chrome API usage — boundary fixture (must FAIL checker).
 * Location: scripts/fixtures/boundary-violations/core-chrome-api.ts
 */
export function captureTab(): void {
  void chrome.tabs.query({ active: true });
}
