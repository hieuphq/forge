import type { ErrorCode } from './index.js';

/**
 * Details attached to an AppError. Not spec-perfect for every future use —
 * later tasks may extend this shape (e.g. add more optional fields).
 */
export interface AppErrorDetails {
  fields?: Record<string, string[]>;
  [key: string]: unknown;
}

/**
 * Base class for all typed application errors.
 *
 * Every error thrown across the stack should carry a namespaced `code`
 * (e.g. `'auth/UNAUTHENTICATED'`, `'common/VALIDATION_FAILED'`) so callers
 * can branch on it, and so `getUserMessage` can resolve a user-facing string.
 */
export class AppError extends Error {
  /** Namespaced error code, e.g. `'common/VALIDATION_FAILED'`. */
  public readonly code: ErrorCode;

  /** Optional structured details (e.g. field-level validation errors). */
  public readonly details?: AppErrorDetails;

  /** HTTP-ish status hint; optional, consumers may map codes to statuses themselves. */
  public readonly status?: number;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { details?: AppErrorDetails; status?: number; cause?: unknown },
  ) {
    super(message ?? code, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.details = options?.details;
    this.status = options?.status;

    // Restore prototype chain (needed when compiling down for some targets).
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
