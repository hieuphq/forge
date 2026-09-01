import type { Context, MiddlewareHandler } from "hono";

/**
 * Resolve the real client IP for rate-limiting purposes.
 *
 * This app has no reverse-proxy configuration framework (no Express-style
 * `app.set('trust proxy', ...)`), so this function is the pragmatic
 * equivalent of "trust proxy": it decides which hop in `X-Forwarded-For`
 * is treated as the real client.
 *
 * Convention used: **first entry wins**. `X-Forwarded-For` is built up as
 * `client, proxy1, proxy2, ...` — each hop APPENDS the address it received
 * the request from. With exactly one trusted intermediate proxy in front of
 * this service (the deployment topology this template assumes), the first
 * entry in the comma-separated list is the original client's address, and
 * everything after it was added by the trusted proxy hop(s) we do not need
 * to key on.
 *
 * This is the exact spot SPEC-004 got wrong: it keyed the rate limiter on
 * `X-Forwarded-For` (or the raw socket IP) without pinning down which hop is
 * the client, so two different clients could collapse into the same bucket.
 * Keying strictly on the first entry keeps distinct client IPs in distinct
 * buckets.
 *
 * Falls back to the raw connection IP (when available) or a fixed
 * "unknown" bucket when neither is available (e.g. no proxy in front of the
 * app in local dev) — that fallback intentionally shares one bucket across
 * unidentified clients rather than pretending it can distinguish them.
 */
export function resolveClientIp(c: Context): string {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = c.req.header("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // No reverse-proxy header present: fall back to whatever raw connection
  // info the runtime exposes, otherwise a single shared bucket.
  const remote = (c.env as { remoteAddr?: string } | undefined)?.remoteAddr;
  return remote ?? "unknown";
}

export interface RateLimitOptions {
  /** Rolling window size, in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key within the window. */
  max: number;
  /** How to derive the bucket key for a request. Defaults to client IP. */
  keyGenerator?: (c: Context) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window rate limiter, keyed per-request via
 * `keyGenerator` (client IP by default, see `resolveClientIp`).
 *
 * Deliberately dependency-free: this is a single-process template app with
 * no Redis/shared store, so an in-memory Map is sufficient and is fully
 * testable in-process (no network, no external service).
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, max, keyGenerator = resolveClientIp } = options;
  const buckets = new Map<string, Bucket>();

  return async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSec = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ error: "Too Many Requests" }, 429);
    }

    await next();
  };
}
