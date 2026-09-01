import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { SessionExpiredError, UnauthenticatedError } from "./auth.errors";
import { TokenExpiredError, verifyAccessToken } from "./jwt";

/** Name of the httpOnly cookie the access token is carried in. */
export const ACCESS_TOKEN_COOKIE = "access_token";

export type RequireAuthVariables = {
  /** Set by `requireAuth` on success — the authenticated user's email. */
  authEmail: string;
};

/**
 * Route middleware: reads the access-token cookie, verifies signature +
 * expiry, and sets `authEmail` in context on success.
 *
 * - No cookie, or a malformed/bad-signature token -> `UnauthenticatedError`
 *   (`auth/UNAUTHENTICATED`).
 * - A structurally valid token whose `exp` has passed -> `SessionExpiredError`
 *   (`auth/SESSION_EXPIRED`) — a DIFFERENT code, because the client's next
 *   action differs (go to login vs silently re-authenticate).
 *
 * Both are `AppError` subclasses, so both flow through the shared
 * `onError` handler and carry `{code, message, traceId}`.
 */
export const requireAuth: MiddlewareHandler<{ Variables: RequireAuthVariables }> = async (
  c,
  next,
) => {
  const token = getCookie(c, ACCESS_TOKEN_COOKIE);

  if (!token) {
    throw new UnauthenticatedError();
  }

  try {
    const payload = await verifyAccessToken(token);
    c.set("authEmail", payload.sub);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      throw new SessionExpiredError();
    }
    throw new UnauthenticatedError();
  }

  await next();
};
