/**
 * Typed domain errors for selection/batch admission.
 * Location: packages/core/src/errors.ts
 */

export class PayloadTooLargeError extends Error {
  readonly code = "payload_too_large" as const;
  readonly field: string;
  readonly maxBytes: number;
  readonly actualBytes: number;

  constructor(field: string, maxBytes: number, actualBytes: number) {
    super(`Payload too large for ${field}: ${actualBytes} bytes exceeds ${maxBytes}`);
    this.name = "PayloadTooLargeError";
    this.field = field;
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}

export class LimitReachedError extends Error {
  readonly code = "limit_reached" as const;
  readonly limit: number;

  constructor(limit: number) {
    super(`Maximum of ${limit} selections per draft reached`);
    this.name = "LimitReachedError";
    this.limit = limit;
  }
}

export class InvalidBatchStateError extends Error {
  readonly code = "invalid_batch_state" as const;
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string) {
    super(`Invalid batch transition from ${from} to ${to}`);
    this.name = "InvalidBatchStateError";
    this.from = from;
    this.to = to;
  }
}
