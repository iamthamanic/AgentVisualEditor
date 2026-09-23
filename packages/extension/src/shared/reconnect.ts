/**
 * Bounded exponential reconnect backoff (FR-027 / T-014).
 * Location: packages/extension/src/shared/reconnect.ts
 */

export type BackoffState = {
  attempt: number;
};

export function nextBackoffMs(state: BackoffState, opts?: {
  baseMs?: number;
  maxMs?: number;
}): { delayMs: number; next: BackoffState } {
  const baseMs = opts?.baseMs ?? 500;
  const maxMs = opts?.maxMs ?? 30_000;
  const exp = Math.min(maxMs, baseMs * 2 ** state.attempt);
  // Full jitter
  const delayMs = Math.floor(Math.random() * exp);
  return {
    delayMs,
    next: { attempt: state.attempt + 1 },
  };
}

export function resetBackoff(): BackoffState {
  return { attempt: 0 };
}
