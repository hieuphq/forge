import { AUTH_ERROR_CODES, type AuthErrorCode } from './auth.errors.js';
import { COMMON_ERROR_CODES, type CommonErrorCode } from './common.errors.js';

export { AppError } from './base.js';
export type { AppErrorDetails } from './base.js';
export { AUTH_ERROR_CODES } from './auth.errors.js';
export type { AuthErrorCode } from './auth.errors.js';
export { COMMON_ERROR_CODES } from './common.errors.js';
export type { CommonErrorCode } from './common.errors.js';

/**
 * Union of every per-module error code literal. Adding a new module's error
 * codes file means adding its type here too — the `satisfies` check below
 * will then force a matching English message for every new code.
 */
export type ErrorCode = CommonErrorCode | AuthErrorCode;

/** All known error codes, flattened, useful for iteration/validation. */
export const ALL_ERROR_CODES = [
  ...COMMON_ERROR_CODES,
  ...AUTH_ERROR_CODES,
] as const;

/**
 * English messages for every error code.
 *
 * The `satisfies Record<ErrorCode, string>` constraint is the load-bearing
 * type-safety mechanic: TypeScript fails compilation if `ErrorCode` grows a
 * new member without a corresponding entry here.
 */
export const ERROR_MESSAGES_EN = {
  'common/VALIDATION_FAILED': 'The submitted data failed validation.',
  'common/INTERNAL_ERROR': 'Something went wrong on our end. Please try again.',
  'common/NOT_FOUND': 'The requested resource could not be found.',
  'common/UNAUTHORIZED': 'You must be signed in to do that.',
  'common/FORBIDDEN': 'You do not have permission to do that.',
  'auth/INVALID_CREDENTIALS': 'Invalid email or password.',
  'auth/UNAUTHENTICATED': 'You must be signed in to do that.',
  'auth/SESSION_EXPIRED': 'Your session has expired. Please sign in again.',
} satisfies Record<ErrorCode, string>;

/** Currently supported locales for user-facing error messages. */
export type Locale = 'en';

/** Resolve a user-facing message for an error code. */
export function getUserMessage(code: ErrorCode, locale: Locale = 'en'): string {
  if (locale === 'en') {
    const enMessage = ERROR_MESSAGES_EN[code];
    if (enMessage !== undefined) return enMessage;
  }

  const fallback = ERROR_MESSAGES_EN[code];
  if (fallback !== undefined) return fallback;

  return code;
}
