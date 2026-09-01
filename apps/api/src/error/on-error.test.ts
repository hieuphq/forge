import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { AppError } from "./app-error";
import { onError } from "./on-error";
import { traceIdMiddleware } from "../middleware/trace-id";

/**
 * Standalone Hono app for testing the trace-id + onError plumbing.
 *
 * Per TASK-011's constraint, the shipped `apps/api/src/index.ts` never
 * gains a throwaway route whose only purpose is to throw — this test file
 * re-composes its own fresh `Hono()` instance, mounting the SAME
 * middleware + error handler used in the real app, plus two test-only
 * routes that throw.
 */
function buildTestApp() {
  const app = new Hono();

  app.use("*", traceIdMiddleware);
  app.onError(onError);

  app.get("/throws-app-error", () => {
    throw new AppError("common/VALIDATION_FAILED", "bad input", { status: 422 });
  });

  app.get("/throws-raw-error", () => {
    throw new Error("leak me");
  });

  app.get("/ok", (c) => c.json({ ok: true }, 200));

  return app;
}

describe("onError + traceIdMiddleware", () => {
  it("returns a matching traceId in body and X-Trace-Id header for an AppError", async () => {
    const app = buildTestApp();

    // Capture what `onError` prints server-side (via `console.log`) so the
    // traceId can be compared across THREE places: the response header,
    // the response body, and the logged line — not just the first two.
    const originalConsoleLog = console.log;
    const loggedLines: string[] = [];
    console.log = (...args: unknown[]) => {
      loggedLines.push(args.map((arg) => String(arg)).join(" "));
    };

    let res: Response;
    try {
      res = await app.request("/throws-app-error");
    } finally {
      console.log = originalConsoleLog;
    }

    expect(res.status).toBe(422);
    const headerTraceId = res.headers.get("X-Trace-Id");
    expect(headerTraceId).toBeTruthy();

    const body = (await res.json()) as { traceId: string; code: string };
    expect(body.traceId).toBe(headerTraceId as string);
    expect(body.code).toBe("common/VALIDATION_FAILED");

    const logLine = loggedLines.find((line) => line.includes(headerTraceId as string));
    expect(logLine).toBeTruthy();
    expect(logLine).toContain(headerTraceId as string);
  });

  it("does not leak a raw error's message into the response body", async () => {
    const app = buildTestApp();
    const res = await app.request("/throws-raw-error");

    expect(res.status).toBe(500);
    const headerTraceId = res.headers.get("X-Trace-Id");
    expect(headerTraceId).toBeTruthy();

    const rawBody = await res.text();
    expect(rawBody).not.toContain("leak me");

    const body = JSON.parse(rawBody) as {
      traceId: string;
      code: string;
      message: string;
    };
    expect(body.code).toBe("common/INTERNAL_ERROR");
    expect(body.traceId).toBe(headerTraceId as string);
    expect(JSON.stringify(body)).not.toContain("leak me");
  });

  it("sets X-Trace-Id on a successful (non-error) response via traceIdMiddleware alone", async () => {
    // No error is thrown here, so `onError` never runs — this isolates
    // `traceIdMiddleware`'s own header-setting `finally` block as the sole
    // source of the header, instead of relying on `onError`'s
    // belt-and-suspenders header set on the error path.
    const app = buildTestApp();
    const res = await app.request("/ok");

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Trace-Id")).toBeTruthy();
  });
});
