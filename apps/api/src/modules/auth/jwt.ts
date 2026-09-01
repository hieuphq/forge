import { sign as jwtSign, verify as jwtVerify } from "hono/jwt";
import { env } from "../../env";

/**
 * Access-token lifetime. Hard cap per TASK-012b: <= 15 minutes. No refresh
 * token in v1 — see `README.md` in this module for the full rationale.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenPayload {
  /** The authenticated user's email — the only identity we track pre-database. */
  sub: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

function getJwtSecret(): string {
  if (!env.JWT_SECRET) {
    // Fails loudly rather than silently signing/verifying with `undefined`
    // (which the JWT lib would otherwise coerce in surprising ways).
    throw new Error(
      "JWT_SECRET is not configured; auth routes cannot issue or verify tokens.",
    );
  }
  return env.JWT_SECRET;
}

/** Mint a signed access token for `email`, expiring in `ACCESS_TOKEN_TTL_SECONDS`. */
export async function issueAccessToken(email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    sub: email,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
  };
  return jwtSign(payload, getJwtSecret());
}

/** Thrown when a token is well-formed but its `exp` claim is in the past. */
export class TokenExpiredError extends Error {
  constructor() {
    super("access token expired");
    this.name = "TokenExpiredError";
  }
}

/** Thrown for every other verification failure: missing, malformed, bad signature, etc. */
export class TokenInvalidError extends Error {
  constructor() {
    super("access token invalid");
    this.name = "TokenInvalidError";
  }
}

/**
 * Verify an access token's signature + claims (including `exp`).
 *
 * `hono/jwt`'s `verify` throws its own internal error classes; we only
 * need to distinguish "expired" from "everything else" here (that
 * distinction is what lets `require-auth.middleware.ts` throw
 * `SessionExpiredError` vs `UnauthenticatedError`), so we narrow on the
 * thrown error's `name` rather than depending on hono's internal error
 * classes directly (they are not part of the package's public export
 * surface).
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    // `hono/jwt`'s `verify` requires an explicit algorithm (it does not
    // default the way `sign` does) — must match `sign`'s own default of
    // HS256, or every token fails with `JwtAlgorithmRequired`.
    const payload = await jwtVerify(token, getJwtSecret(), "HS256");
    return payload as unknown as AccessTokenPayload;
  } catch (err) {
    if (err instanceof Error && err.name === "JwtTokenExpired") {
      throw new TokenExpiredError();
    }
    throw new TokenInvalidError();
  }
}
