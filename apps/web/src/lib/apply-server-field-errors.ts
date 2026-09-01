import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/**
 * Maps the api's `{code, message, traceId, details: {fields}}` validation
 * error shape (built server-side by `ValidationError`, TASK-012) directly
 * onto a React Hook Form instance.
 *
 * `fields` is `Record<fieldName, string[]>` — one or more human-readable
 * messages per field, already the intended user-facing text (the api's
 * `hook` produces these from Zod's own issue messages, never a raw
 * wire-format artifact). This is generic and reusable across any module's
 * form, not example-specific, so it lives in `src/lib/` (a `shared`-type
 * boundary element per `.oxlintrc.json`, importable from anywhere).
 *
 * `locale` is accepted for forward-compatibility with a future
 * locale-aware message lookup, but is unused today: the field messages
 * already come pre-localized (EN-only, from the api's `hook`).
 */
export function applyServerFieldErrors<TFieldValues extends FieldValues = FieldValues>(
  form: Pick<UseFormReturn<TFieldValues>, "setError">,
  fields: Record<string, string[]>,
  _locale?: string,
): void {
  for (const [fieldName, messages] of Object.entries(fields)) {
    if (messages.length === 0) continue;

    form.setError(fieldName as Path<TFieldValues>, {
      type: "server",
      message: messages.join(" "),
    });
  }
}
