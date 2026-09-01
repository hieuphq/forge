import { beforeAll, describe, expect, test } from "bun:test";
import type { OpenAPIHono } from "@hono/zod-openapi";

// The real app's rate limiter is keyed on the client IP resolved from
// X-Forwarded-For (see `resolveClientIp` in ./rate-limit.ts). This test
// proves the exact regression SPEC-004 shipped does NOT happen here: two
// requests carrying DIFFERENT X-Forwarded-For values must land in
// DIFFERENT rate-limit buckets, not collapse into one shared bucket.
//
// `env.ts` requires DATABASE_URL to be set before it will finish loading
// (it calls process.exit(1) otherwise), so the required env vars are set
// here BEFORE the app module is imported. A dynamic import is used because
// static `import` statements are hoisted above ordinary statements, which
// would run the env validation before we get a chance to set process.env.
let app: OpenAPIHono;

beforeAll(async () => {
  process.env.DATABASE_URL ??=
    "postgres://postgres:postgres@localhost:5433/forge_test";
  process.env.CORS_ALLOWED_ORIGINS ??= "http://localhost:5173";
  ({ app } = await import("../index"));
});

const RATE_LIMIT_MAX = 100; // must match the `max` configured in ./security.ts

describe("rate limit keys on the resolved proxy client IP", () => {
  test("different X-Forwarded-For values get separate rate-limit buckets", async () => {
    const clientA = "1.1.1.1";
    const clientB = "2.2.2.2";

    // Exhaust client A's bucket: RATE_LIMIT_MAX requests should all succeed.
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const res = await app.request("/health", {
        headers: { "x-forwarded-for": clientA },
      });
      expect(res.status).toBe(200);
    }

    // One more request from client A must now be rate-limited.
    const overLimitRes = await app.request("/health", {
      headers: { "x-forwarded-for": clientA },
    });
    expect(overLimitRes.status).toBe(429);

    // A request from a DIFFERENT client (different X-Forwarded-For) must
    // NOT be rate-limited — it belongs to its own, fresh bucket.
    const clientBRes = await app.request("/health", {
      headers: { "x-forwarded-for": clientB },
    });
    expect(clientBRes.status).toBe(200);
  });

  test("multiple forwarded hops: the first entry (the real client) is used", async () => {
    // X-Forwarded-For is built as "client, proxy1, proxy2, ...". The first
    // entry is treated as the real client (see resolveClientIp docs). A
    // request that shares the same first entry as an exhausted bucket, but
    // has a different trailing proxy chain, must still be rate-limited —
    // proving the extra hops are ignored, not used as part of the key.
    const res = await app.request("/health", {
      headers: { "x-forwarded-for": "1.1.1.1, 10.0.0.5" },
    });
    expect(res.status).toBe(429);
  });
});
