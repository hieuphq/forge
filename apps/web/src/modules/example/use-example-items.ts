import { useCallback, useEffect, useState } from "react";

import { apiBaseUrl } from "@/lib/runtime-config";


export interface ExampleItem {
  id: string;
  title: string;
  /** A calendar date, e.g. a due date — a plain `YYYY-MM-DD` STRING. */
  dueDate: string;
}

/** The api's `ValidationError` shape (TASK-012), surfaced on a 400. */
export interface ApiValidationErrorBody {
  code: string;
  message: string;
  traceId: string;
  details?: { fields?: Record<string, string[]> };
}

/**
 * Thrown by `createExampleItem` when the api rejects the request body.
 * Carries the parsed error body so a caller can pass `fields` straight
 * into `applyServerFieldErrors`.
 */
export class ExampleItemValidationError extends Error {
  constructor(public readonly body: ApiValidationErrorBody) {
    super(body.message);
    this.name = "ExampleItemValidationError";
  }
}

/**
 * Posts a new example item. Throws `ExampleItemValidationError` on a 400
 * `common/VALIDATION_FAILED` response so the form's submit handler can
 * map `details.fields` onto React Hook Form via `applyServerFieldErrors`.
 */
export async function createExampleItem(input: {
  title: string;
  dueDate: string;
}): Promise<ExampleItem> {
  const res = await fetch(`${apiBaseUrl}/example-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = (await res.json()) as ApiValidationErrorBody;
    if (res.status === 400 && body.code === "common/VALIDATION_FAILED") {
      throw new ExampleItemValidationError(body);
    }
    throw new Error(body.message ?? `Failed to create example item (status ${res.status})`);
  }

  return (await res.json()) as ExampleItem;
}

/**
 * Private to this module (not re-exported from `index.ts`) — the
 * boundary rule (`.oxlintrc.json`) requires outside consumers to reach
 * this module only through its own `index.ts`, so this hook stays an
 * internal implementation detail of the example module's form/list UI.
 *
 * Deliberately a plain `useState` + `useEffect` wrapper around `fetch`
 * rather than react-query/tanstack-query — this template keeps
 * dependencies minimal, and this module doesn't need caching, retries, or
 * background refetch.
 */
export function useExampleItems() {
  const [items, setItems] = useState<ExampleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/example-items`);
      if (!res.ok) {
        throw new Error(`Failed to load example items (status ${res.status})`);
      }
      const body = (await res.json()) as { items: ExampleItem[] };
      setItems(body.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load example items");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, isLoading, error, refetch };
}
