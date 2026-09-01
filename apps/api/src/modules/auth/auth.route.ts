import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { deleteCookie, setCookie } from "hono/cookie";
import { rateLimit } from "../../middleware/rate-limit";
import { ValidationError } from "../../error/validation-error";
import { AuthenticationError } from "./auth.errors";
import { ACCESS_TOKEN_TTL_SECONDS, issueAccessToken } from "./jwt";
import { ACCESS_TOKEN_COOKIE, requireAuth, type RequireAuthVariables } from "./require-auth.middleware";
import { findUserByEmail, registerUser } from "./user-store";

/**
 * A fixed dummy hash, computed once at module load, verified against
 * whenever the looked-up user does not exist. Without this, an unknown
 * email would short-circuit straight to failure while a known email always
 * pays the cost of an argon2id verify — a timing side-channel an attacker
 * could use to enumerate valid accounts. Always paying the verify cost
 * (against a REAL argon2id hash, not a cheap stand-in) keeps the two code
 * paths' timing close, on top of the response body/status already being
 * identical below.
 */
const DUMMY_PASSWORD_HASH = Bun.password.hashSync("dummy-password-used-only-for-timing-parity", {
  algorithm: "argon2id",
});

const credentialsBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Shared `createRoute` validation hook: on a Zod failure, throw
 * `ValidationError` (never build/return a Response) so malformed auth
 * requests flow through the exact same `onError` pipeline as every other
 * validated route (TASK-012's pattern).
 */
function throwOnValidationFailure(result: {
  success: boolean;
  error?: { issues: { path: (string | number)[]; message: string }[] };
}): undefined {
  if (!result.success && result.error) {
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const fieldPath = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      (fields[fieldPath] ??= []).push(issue.message);
    }
    throw new ValidationError(fields);
  }
  return undefined;
}

const registerRoute = createRoute({
  method: "post",
  path: "/auth/register",
  request: {
    body: { content: { "application/json": { schema: credentialsBodySchema } } },
  },
  responses: {
    201: {
      description: "User registered.",
      content: {
        "application/json": { schema: z.object({ email: z.string() }) },
      },
    },
  },
});

const loginRoute = createRoute({
  method: "post",
  path: "/auth/login",
  request: {
    body: { content: { "application/json": { schema: credentialsBodySchema } } },
  },
  responses: {
    200: {
      description: "Login succeeded; access token set as an httpOnly cookie.",
      content: {
        "application/json": { schema: z.object({ ok: z.literal(true) }) },
      },
    },
  },
});

const meRoute = createRoute({
  method: "get",
  path: "/auth/me",
  responses: {
    200: {
      description: "The authenticated user's identity.",
      content: {
        "application/json": { schema: z.object({ email: z.string() }) },
      },
    },
  },
});

/**
 * Builds a fresh auth app instance. A factory (not a module-level
 * singleton) so tests can spin up an isolated instance per test — the
 * stricter rate limiter below is stateful (an in-memory bucket Map), and
 * sharing one instance across unrelated tests would make the rate-limit
 * bucket bleed between them. Production wiring (`src/index.ts`) uses the
 * single `authApp` export below.
 */
export function createAuthApp() {
  const authApp = new OpenAPIHono<{ Variables: RequireAuthVariables }>();

  // Auth-specific rate limit (TASK-012b): stricter than the global 100
  // req/min limiter applied to every route in `src/index.ts`. Auth
  // endpoints are the highest-value target for credential stuffing /
  // brute force, so they get their own, much lower threshold, in their
  // own bucket (a separate `rateLimit()` instance = a separate Map),
  // completely independent of the global limiter's bucket.
  authApp.use("*", rateLimit({ windowMs: 60_000, max: 10 }));

  authApp.openapi(
    registerRoute,
    async (c) => {
      const { email, password } = c.req.valid("json");
      const user = await registerUser(email, password);
      return c.json({ email: user.email }, 201);
    },
    throwOnValidationFailure,
  );

  authApp.openapi(
    loginRoute,
    async (c) => {
      const { email, password } = c.req.valid("json");
      const user = findUserByEmail(email);

      // ALWAYS verify against a real argon2id hash, whether or not the
      // user exists (see `DUMMY_PASSWORD_HASH` above) — no branch here
      // skips the verify call, so an unknown email and a wrong password
      // take the same code path from this point on.
      const hashToCheck = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
      const passwordMatches = await Bun.password.verify(password, hashToCheck);

      if (!user || !passwordMatches) {
        // Same error, same status, same body for "no such user" and
        // "wrong password" — see `AuthenticationError` for why.
        throw new AuthenticationError();
      }

      const token = await issueAccessToken(user.email);

      // CSRF stance (v1, stated explicitly per TASK-012b): the access
      // token lives ONLY in an httpOnly + SameSite=Lax + Secure cookie,
      // never in the JSON body (so it can't end up in localStorage).
      // `SameSite=Lax` already blocks the cookie from being attached to a
      // cross-site POST in modern browsers — the exact request shape a
      // CSRF attack against a POST-handling backend needs — and this API
      // is same-origin-by-default: `src/middleware/security.ts`'s CORS
      // allowlist already restricts which origins can read a response, and
      // there is no cross-site GET-triggered state change here. SameSite=Lax
      // + the CORS allowlist is the primary CSRF mitigation for v1. A
      // dedicated CSRF-token/double-submit scheme is not implemented and
      // would be revisited if this API ever needs to support a genuinely
      // cross-site client (e.g. a third-party integration posting on a
      // user's behalf).
      setCookie(c, ACCESS_TOKEN_COOKIE, token, {
        httpOnly: true,
        sameSite: "Lax",
        secure: true,
        path: "/",
        maxAge: ACCESS_TOKEN_TTL_SECONDS,
      });

      return c.json({ ok: true as const }, 200);
    },
    throwOnValidationFailure,
  );

  authApp.use("/auth/me", requireAuth);
  authApp.openapi(meRoute, (c) => {
    const email = c.get("authEmail");
    return c.json({ email }, 200);
  });

  // Best-effort logout: no refresh-token/session store exists in v1 to
  // revoke, so this only deletes the cookie client-side. See README.md
  // for the full "no refresh token in v1" rationale.
  authApp.post("/auth/logout", (c) => {
    deleteCookie(c, ACCESS_TOKEN_COOKIE, { path: "/" });
    return c.json({ ok: true as const }, 200);
  });

  return authApp;
}

/** Production singleton — mounted directly in `src/index.ts`. */
export const authApp = createAuthApp();
