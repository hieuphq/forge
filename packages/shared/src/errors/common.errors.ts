/**
 * Error codes shared across all modules (not specific to any one domain).
 * Namespaced under `common/...` per the per-module taxonomy convention.
 */
export const COMMON_ERROR_CODES = [
  'common/VALIDATION_FAILED',
  'common/INTERNAL_ERROR',
  'common/NOT_FOUND',
  'common/UNAUTHORIZED',
  'common/FORBIDDEN',
] as const;

export type CommonErrorCode = (typeof COMMON_ERROR_CODES)[number];
