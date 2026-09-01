import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError, getUserMessage } from "./app-error";
import { getTraceId } from "../middleware/trace-id";

/**
 * The single place an error response gets constructed.
 *
 * - `AppError` thrown anywhere downstream: logged structured (with
 *   `traceId` + `code`), and the client gets `{code, message, traceId,
 *   details?}` at `error.status ?? 500`.
 * - Anything else (a raw `Error`, a rejected promise, whatever): logged IN
 *   FULL server-side (message + stack + traceId), but the client only ever
 *   sees `{code: 'common/INTERNAL_ERROR', message, traceId}` — no stack,
 *   no original message, on the wire. This is the security-critical
 *   branch: nothing error-derived from an unknown error reaches the
 *   response body.
 *
 * `X-Trace-Id` is set on the response here too (belt-and-suspenders with
 * `traceIdMiddleware`'s own `finally`-block header set), per AC-3.
 *
 * The whole body is wrapped in its own try/catch: if constructing the
 * error response itself throws (a hostile `getUserMessage`, a logger that
 * chokes on a circular object, anything), this falls through to a
 * HARDCODED static response — no template-string interpolation of
 * anything error-derived — so `onError` itself can never throw.
 */
export const onError: ErrorHandler = (err, c) => {
  try {
    const traceId = getTraceId() ?? crypto.randomUUID();

    if (err instanceof AppError) {
      const status = err.status ?? 500;

      console.log(
        JSON.stringify({
          level: "error",
          msg: "request failed with AppError",
          traceId,
          code: err.code,
          message: err.message,
        }),
      );

      c.header("X-Trace-Id", traceId);
      return c.json(
        {
          code: err.code,
          message: getUserMessage(err.code, "en"),
          traceId,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
        status as ContentfulStatusCode,
      );
    }

    // Unknown error branch: log everything server-side, leak nothing to
    // the client.
    console.log(
      JSON.stringify({
        level: "error",
        msg: "request failed with unknown error",
        traceId,
        error: {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
      }),
    );

    c.header("X-Trace-Id", traceId);
    return c.json(
      {
        code: "common/INTERNAL_ERROR",
        message: getUserMessage("common/INTERNAL_ERROR", "en"),
        traceId,
      },
      500,
    );
  } catch {
    // Constructing the error response itself blew up. Fall through to a
    // hardcoded, non-interpolated response so this handler never throws.
    return c.json(
      {
        code: "common/INTERNAL_ERROR",
        message: "An unexpected error occurred",
        traceId: "unknown",
      },
      500,
    );
  }
};
