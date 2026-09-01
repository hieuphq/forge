import { AsyncLocalStorage } from "node:async_hooks";
import { trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";

interface TraceStore {
  traceId: string;
}

const als = new AsyncLocalStorage<TraceStore>();

/**
 * Read the current request's trace ID from anywhere downstream (loggers,
 * error handlers) within the same async context. Returns `undefined` when
 * called outside of a request handled by `traceIdMiddleware` (e.g. at
 * module load time).
 */
export function getTraceId(): string | undefined {
  return als.getStore()?.traceId;
}

/**
 * Derive/mint a trace ID for the current request and carry it through the
 * request lifecycle via `AsyncLocalStorage`.
 *
 * - If OTel has an active span, use its span's trace ID.
 * - Otherwise mint a fresh `crypto.randomUUID()`.
 *
 * Deliberately never trusts a client-supplied trace-id header — the trace
 * ID is always derived or minted server-side so a client cannot spoof or
 * inject a trace ID into logs/responses.
 *
 * Sets `X-Trace-Id` on the response header in BOTH the success and the
 * thrown-error path: when `next()` throws (Hono's error dispatch takes
 * over and calls `onError`), the `finally` block below still runs and sets
 * the header on the shared `Context` before the error propagates, so it
 * ends up merged onto whatever response `onError` ultimately builds. The
 * error handler (`onError`, see `src/error/on-error.ts`) ALSO sets this
 * header explicitly — belt and suspenders, since which Hono internals
 * preserve headers set before a throw is not something to rely on blindly.
 */
export const traceIdMiddleware: MiddlewareHandler = async (c, next) => {
  const activeSpan = trace.getActiveSpan();
  const traceId = activeSpan?.spanContext().traceId ?? crypto.randomUUID();

  try {
    await als.run({ traceId }, async () => {
      await next();
    });
  } finally {
    c.header("X-Trace-Id", traceId);
  }
};

export { als as traceAls };
