import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { env } from "../env";
import { rateLimit } from "./rate-limit";

/** Hono's built-in secure-headers middleware, defaults are sane for an API. */
export const securityHeaders = secureHeaders();

/**
 * CORS configured from an env-driven allowlist. Never falls back to "*" —
 * `origin` only ever returns an origin that is explicitly on the allowlist
 * (or `undefined`, which Hono's cors middleware treats as "deny").
 *
 * `X-Trace-Id` and `traceparent` are exposed now even though nothing sets
 * them yet — a later task adds trace-id middleware, and wiring the CORS
 * config here means that task doesn't need to revisit this file.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return undefined;
    return env.CORS_ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
  },
  exposeHeaders: ["X-Trace-Id", "traceparent"],
});

/**
 * Global rate limit: 100 requests / minute per resolved client IP (see
 * `resolveClientIp` in `./rate-limit.ts` for how the client IP is derived
 * from `X-Forwarded-For`).
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: 60_000,
  max: 100,
});
