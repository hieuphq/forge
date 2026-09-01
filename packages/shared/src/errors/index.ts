import { AUTH_ERROR_CODES, type AuthErrorCode } from './auth.errors.js';
import { COMMON_ERROR_CODES, type CommonErrorCode } from './common.errors.js';
import { EXAMPLE_ERROR_CODES, type ExampleErrorCode } from './example.errors.js';

export { AppError } from './base.js';
export type { AppErrorDetails } from './base.js';
export { AUTH_ERROR_CODES } from './auth.errors.js';
export type { AuthErrorCode } from './auth.errors.js';
export { COMMON_ERROR_CODES } from './common.errors.js';
export type { CommonErrorCode } from './common.errors.js';
export { EXAMPLE_ERROR_CODES } from './example.errors.js';
export type { ExampleErrorCode } from './example.errors.js';

/**
 * Union of every per-module error code literal. Adding a new module's error
 * codes file means adding its type here too — the `satisfies` check below
 * will then force a matching English message for every new code.
 */
export type ErrorCode = CommonErrorCode | ExampleErrorCode | AuthErrorCode;

/** All known error codes, flattened, useful for iteration/validation. */
export const ALL_ERROR_CODES = [
  ...COMMON_ERROR_CODES,
  ...EXAMPLE_ERROR_CODES,
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
  'example/NOT_FOUND': 'The requested example could not be found.',
  'example/ALREADY_EXISTS': 'An example with that identifier already exists.',
  'auth/INVALID_CREDENTIALS': 'Invalid email or password.',
  'auth/UNAUTHENTICATED': 'You must be signed in to do that.',
  'auth/SESSION_EXPIRED': 'Your session has expired. Please sign in again.',
} satisfies Record<ErrorCode, string>;

/** Currently supported locales for user-facing error messages. */
export type Locale = 'en';

/**
 * Resolve a user-facing message for an error code.
 *
 * Three-tier fallback:
 *   1. Exact locale hit (locale-specific messages map, when one exists).
 *      For v1 only `'en'` is supported, so this tier and tier 2 collapse.
 *   2. EN fallback via `ERROR_MESSAGES_EN[code]`.
 *   3. Raw code string — defensive, should be unreachable given the
 *      `satisfies` guard above, but kept as a real, reachable branch (a
 *      later test mutates this branch away and expects the test to fail).
 */
export function getUserMessage(code: ErrorCode, locale: Locale = 'en'): string {
  // Tier 1: locale-specific lookup. Only 'en' exists today, so this is a
  // no-op indirection until a second locale map is added.
  if (locale === 'en') {
    const enMessage = ERROR_MESSAGES_EN[code];
    if (enMessage !== undefined) {
      return enMessage;
    }
  }

  // Tier 2: EN fallback (covers non-'en' locales with no dedicated map yet).
  const fallback = ERROR_MESSAGES_EN[code];
  if (fallback !== undefined) {
    return fallback;
  }

  // Tier 3: raw code string, defensive fallback.
  return code;
}
