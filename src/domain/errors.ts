/** Typed domain errors. Every failure carries a stable code for API clients and tests. */

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OUT_OF_STOCK'
  | 'IDEMPOTENCY_MISMATCH'
  | 'PAYMENT_FAILED'
  | 'STATE'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  IDEMPOTENCY_MISMATCH: 409,
  PAYMENT_FAILED: 402,
  STATE: 409,
  INTERNAL: 500,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const validation = (message: string, details?: Record<string, unknown>) =>
  new DomainError('VALIDATION', message, details);
export const unauthenticated = (message = 'authentication required') =>
  new DomainError('UNAUTHENTICATED', message);
export const forbidden = (message = 'not permitted') => new DomainError('FORBIDDEN', message);
export const notFound = (message = 'not found') => new DomainError('NOT_FOUND', message);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new DomainError('CONFLICT', message, details);
export const outOfStock = (message: string, details?: Record<string, unknown>) =>
  new DomainError('OUT_OF_STOCK', message, details);
export const stateError = (message: string, details?: Record<string, unknown>) =>
  new DomainError('STATE', message, details);