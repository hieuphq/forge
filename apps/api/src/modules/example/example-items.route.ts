import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
// `@yourorg/lib` ships no package-level entry point (no `main`/`exports`
// field) yet — this repo's "do not touch packages/" boundary means this
// module reaches the helper via its concrete source path rather than
// adding one, same resolution Bun already gives every workspace package
// without an entry point declared.
import { fromCalendarDateString } from "@yourorg/lib/src/calendar-date";
import { ValidationError } from "../../error/validation-error";
import {
  createExampleItem,
  listExampleItems,
} from "./example-items.repository";

/**
 * A calendar date is stored and validated as a plain `YYYY-MM-DD` STRING
 * end to end — never parsed into a `Date` and compared naively (see
 * `packages/lib/src/calendar-date.ts`'s module doc for why). The regex
 * only checks the shape; `.refine` below calls `@yourorg/lib`'s
 * `fromCalendarDateString` so an out-of-range value like `2026-13-40`
 * (right shape, impossible calendar date) is rejected too, and so this
 * module has a real production caller of the shared calendar-date helper.
 */
const CALENDAR_DATE_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/;

const calendarDateStringSchema = z
  .string()
  .regex(CALENDAR_DATE_SHAPE_RE, "dueDate must be in YYYY-MM-DD format")
  .refine(
    (value) => {
      try {
        const { year, month, day } = fromCalendarDateString(value);
        return month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1;
      } catch {
        return false;
      }
    },
    { message: "dueDate must be a valid calendar date" },
  );

const exampleItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  dueDate: z.string(),
});

const createExampleItemBodySchema = z.object({
  title: z.string().min(1, "title is required"),
  dueDate: calendarDateStringSchema,
});

/**
 * Shared `createRoute` validation hook, same pattern as
 * `auth.route.ts`'s `throwOnValidationFailure`: on a Zod failure, throw
 * `ValidationError` (never build/return a Response) so a malformed
 * request flows through the exact same `onError` pipeline as every other
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

const createExampleItemRoute = createRoute({
  method: "post",
  path: "/example-items",
  request: {
    body: {
      content: {
        "application/json": { schema: createExampleItemBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Example item created.",
      content: {
        "application/json": { schema: exampleItemSchema },
      },
    },
  },
});

const listExampleItemsRoute = createRoute({
  method: "get",
  path: "/example-items",
  responses: {
    200: {
      description: "All example items.",
      content: {
        "application/json": { schema: z.object({ items: z.array(exampleItemSchema) }) },
      },
    },
  },
});

/**
 * `POST /example-items` + `GET /example-items` — the vertical-slice
 * example module (TASK-013): a real-ish CRUD-ish route carrying one
 * calendar-date field (`dueDate`) so `packages/lib`'s date helpers have a
 * production caller, wired through the exact same validation ->
 * `ValidationError` -> `onError` pipeline as `auth.route.ts`.
 */
export const exampleItemsApp = new OpenAPIHono()
  .openapi(
    createExampleItemRoute,
    async (c) => {
      const { title, dueDate } = c.req.valid("json");
      const item = await createExampleItem(title, dueDate);
      return c.json(item, 201);
    },
    throwOnValidationFailure,
  )
  .openapi(listExampleItemsRoute, async (c) => {
    return c.json({ items: await listExampleItems() }, 200);
  });
