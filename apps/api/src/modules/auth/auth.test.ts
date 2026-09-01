import { beforeEach, describe, expect, it } from "bun:test";
import { OpenAPIHono } from "@hono/zod-openapi";
import { sign as jwtSign } from "hono/jwt";
import { onError } from "../../error/on-error";
import { traceIdMiddleware } from "../../middleware/trace-id";
import { env } from "../../env";
import { createAuthApp } from "./auth.route";
import { __resetUserStoreForTests, findUserByEmail } from "./user-store";
import { ACCESS_TOKEN_COOKIE } from "./require-auth.middleware";

/**
 * Fresh app instance per test, mirroring `validate-example.route.test.ts`'s
 * pattern: re-compose the SAME middleware + error handler as the real app.
 * `createAuthApp()` (not the module-singleton `authApp`) so each test gets
 * its OWN rate-limit bucket — otherwise test (g)'s deliberate rate-limit
 * trip would bleed into every other test in this file.
 */
function buildTestApp() {
  const app = new OpenAPIHono();
  app.use("*", traceIdMiddleware);
  app.onError(onError);
  app.route("/", createAuthApp());
  return app;
}

function extractCookieValue(setCookieHeader: string | null, name: string): string | undefined {
  if (!setCookieHeader) return undefined;
  const match = setCookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

describe("auth module", () => {
  beforeEach(() => {
    __resetUserStoreForTests();
  });

  it("registers + logs in successfully, setting an httpOnly/SameSite=Lax cookie", async () => {
    const app = buildTestApp();

    const registerRes = await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", password: "correct horse battery" }),
    });
    expect(registerRes.status).toBe(201);

    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ada@example.com", password: "correct horse battery" }),
    });

    expect(loginRes.status).toBe(200);
    const body = (await loginRes.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const setCookie = loginRes.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    // NOTE (honest tradeoff, see also README.md): `Secure` IS set in
    // production code (see auth.route.ts's `setCookie` call), and Hono
    // writes the attribute into the header regardless of whether the
    // current connection is actually TLS — it does not inspect the
    // request's protocol. So this assertion is a real check of the
    // production cookie config, even though this test drives the app
    // in-process over `app.request()` (no real HTTP/TLS involved at all).
    // A REAL browser talking to a REAL server over plain http would drop
    // this cookie because `Secure` is set — that is expected and correct
    // for a deployed-over-TLS API, but it does mean this attribute cannot
    // be exercised end-to-end against a plain-http local dev server; the
    // live smoke test for this task documents that limitation again.
    expect(setCookie).toContain("Secure");
    expect(setCookie?.startsWith(`${ACCESS_TOKEN_COOKIE}=`)).toBe(true);
  });

  it("returns BYTE-IDENTICAL responses for unknown-user vs wrong-password", async () => {
    const app = buildTestApp();

    await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "grace@example.com", password: "the-real-password" }),
    });

    const unknownUserRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "whatever" }),
    });
    const wrongPasswordRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "grace@example.com", password: "wrong-password" }),
    });

    expect(unknownUserRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownUserRes.status).toBe(wrongPasswordRes.status);

    const unknownUserText = await unknownUserRes.text();
    const wrongPasswordText = await wrongPasswordRes.text();

    // Compare the exact serialized strings, not just "same shape" — a
    // traceId is per-request-unique, so parse both, strip traceId, and
    // compare the remaining serialized bodies for byte-for-byte equality.
    const unknownUserBody = JSON.parse(unknownUserText) as Record<string, unknown>;
    const wrongPasswordBody = JSON.parse(wrongPasswordText) as Record<string, unknown>;

    expect(typeof unknownUserBody.traceId).toBe("string");
    expect(typeof wrongPasswordBody.traceId).toBe("string");

    const { traceId: _unknownTraceId, ...unknownRest } = unknownUserBody;
    const { traceId: _wrongTraceId, ...wrongRest } = wrongPasswordBody;

    expect(JSON.stringify(unknownRest)).toBe(JSON.stringify(wrongRest));
    expect(unknownUserBody.code).toBe("auth/INVALID_CREDENTIALS");
  });

  it("rejects a missing cookie on the protected route with auth/UNAUTHENTICATED", async () => {
    const app = buildTestApp();

    const res = await app.request("/auth/me");

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("auth/UNAUTHENTICATED");
  });

  it("rejects a malformed cookie on the protected route with auth/UNAUTHENTICATED", async () => {
    const app = buildTestApp();

    const res = await app.request("/auth/me", {
      headers: { Cookie: `${ACCESS_TOKEN_COOKIE}=not-a-real-jwt` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("auth/UNAUTHENTICATED");
  });

  it("rejects an expired token on the protected route with auth/SESSION_EXPIRED", async () => {
    const app = buildTestApp();

    // Mint an already-expired JWT directly, bypassing the login flow, to
    // deterministically exercise the expiry branch.
    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await jwtSign(
      { sub: "expired@example.com", iat: now - 3600, exp: now - 60 },
      env.JWT_SECRET as string,
    );

    const res = await app.request("/auth/me", {
      headers: { Cookie: `${ACCESS_TOKEN_COOKIE}=${expiredToken}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("auth/SESSION_EXPIRED");
  });

  it("returns 200 with the authenticated identity for a valid token", async () => {
    const app = buildTestApp();

    await app.request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "turing@example.com", password: "enigma-breaker" }),
    });

    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "turing@example.com", password: "enigma-breaker" }),
    });

    const token = extractCookieValue(loginRes.headers.get("Set-Cookie"), ACCESS_TOKEN_COOKIE);
    expect(token).toBeTruthy();

    const meRes = await app.request("/auth/me", {
      headers: { Cookie: `${ACCESS_TOKEN_COOKIE}=${token}` },
    });

    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as { email: string };
    expect(body.email).toBe("turing@example.com");
  });

  it("never stores the plaintext password", async () => {
    const plaintext = "super-secret-plaintext";
    await import("./user-store").then((mod) => mod.registerUser("hopper@example.com", plaintext));

    const stored = findUserByEmail("hopper@example.com");
    expect(stored).toBeDefined();
    expect(stored?.passwordHash).not.toBe(plaintext);
    // Sanity: it IS an argon2id hash, not just "some other string".
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("trips the auth-specific rate limit before the (much higher) global limiter would", async () => {
    const app = buildTestApp();

    // The auth bucket in `createAuthApp()` is max=10/min; the global
    // limiter in `src/middleware/security.ts` is max=100/min. Firing 11
    // requests at /auth/login must trip the auth bucket well before 100
    // requests, proving the two limiters are independent and the auth one
    // is materially stricter.
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "rate-limit-probe@example.com", password: "whatever" }),
      });
      statuses.push(res.status);
    }

    expect(statuses.length).toBe(11);
    expect(statuses[10]).toBe(429);
    // The first 10 requests should NOT have been rate-limited (they may
    // still be 401s — wrong credentials — but not 429).
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
  });
});
