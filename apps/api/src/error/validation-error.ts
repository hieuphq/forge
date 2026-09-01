import { AppError } from "./app-error";

/**
 * Thrown by request-validation hooks (see `@hono/zod-openapi`'s
 * `createRoute` `hook` option) when Zod rejects the request body/query/
 * params.
 *
 * Deliberately just an `AppError` with the code hardcoded to
 * `'common/VALIDATION_FAILED'` and `status` hardcoded to `400` — it flows
 * through the exact same `onError` handler as every other `AppError`, so
 * the response shape is never a special, ad-hoc "validation error" shape.
 */
export class ValidationError extends AppError {
  constructor(fields: Record<string, string[]>) {
    super("common/VALIDATION_FAILED", "Request validation failed", {
      details: { fields },
      status: 400,
    });
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
