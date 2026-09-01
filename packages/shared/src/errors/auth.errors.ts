/**
 * Auth module error codes (TASK-012b). Namespaced under `auth/...` per the
 * per-module taxonomy convention established by `common.errors.ts` and
 * `example.errors.ts`.
 *
 * `auth/UNAUTHENTICATED` and `auth/SESSION_EXPIRED` are deliberately
 * DISTINCT codes even though both are "you don't have a valid session"
 * outcomes: a missing/malformed token means the client should go to the
 * login screen, while an expired token means the client can (in a later
 * version, once refresh tokens exist) silently re-authenticate or prompt a
 * lighter-weight re-login. Collapsing them into one code would lose that
 * distinction for the client.
 */
export const AUTH_ERROR_CODES = [
  'auth/INVALID_CREDENTIALS',
  'auth/UNAUTHENTICATED',
  'auth/SESSION_EXPIRED',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
