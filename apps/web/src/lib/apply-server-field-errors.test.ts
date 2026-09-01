import { describe, expect, it, mock } from "bun:test";
import type { UseFormReturn } from "react-hook-form";
import { applyServerFieldErrors } from "./apply-server-field-errors";

/**
 * `applyServerFieldErrors` is exercised against a mock `form` object with
 * a spy `setError` rather than a full `useForm()` instance — the cleanest
 * testable seam for a pure mapping function, and it avoids pulling a DOM
 * environment into this template's `bun test` setup just for this one
 * unit.
 */
function buildMockForm() {
  const setError = mock(() => undefined);
  const form = { setError } as unknown as UseFormReturn<Record<string, unknown>>;
  return { form, setError };
}

describe("applyServerFieldErrors", () => {
  it("calls setError with the field name, the joined message, and type: server", () => {
    const { form, setError } = buildMockForm();

    applyServerFieldErrors(form, {
      dueDate: ["dueDate must be in YYYY-MM-DD format"],
    });

    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith("dueDate", {
      type: "server",
      message: "dueDate must be in YYYY-MM-DD format",
    });
  });

  it("maps every field in the details.fields object, one setError call each", () => {
    const { form, setError } = buildMockForm();

    applyServerFieldErrors(form, {
      title: ["title is required"],
      dueDate: ["dueDate must be a valid calendar date"],
    });

    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenCalledWith("title", {
      type: "server",
      message: "title is required",
    });
    expect(setError).toHaveBeenCalledWith("dueDate", {
      type: "server",
      message: "dueDate must be a valid calendar date",
    });
  });

  it("joins multiple messages for the same field into one message string", () => {
    const { form, setError } = buildMockForm();

    applyServerFieldErrors(form, {
      title: ["title is required", "title must be at most 100 characters"],
    });

    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith("title", {
      type: "server",
      message: "title is required title must be at most 100 characters",
    });
  });

  it("does nothing when fields is empty", () => {
    const { form, setError } = buildMockForm();

    applyServerFieldErrors(form, {});

    expect(setError).not.toHaveBeenCalled();
  });

  it("skips a field whose message array is empty", () => {
    const { form, setError } = buildMockForm();

    applyServerFieldErrors(form, { title: [] });

    expect(setError).not.toHaveBeenCalled();
  });
});
