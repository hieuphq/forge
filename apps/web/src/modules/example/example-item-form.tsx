import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { applyServerFieldErrors } from "@/lib/apply-server-field-errors";
import {
  createExampleItem,
  ExampleItemValidationError,
  useExampleItems,
} from "./use-example-items";

/**
 * Client-side shape mirrors the api's `createExampleItemBodySchema`
 * (`apps/api/src/modules/example/example-items.route.ts`) so an obviously
 * invalid submission never round-trips to the server — the api's own
 * validation stays the source of truth, this is just a fast local check.
 * A native `<input type="date">` naturally produces a `YYYY-MM-DD`
 * string, which is exactly the calendar-date shape the api expects — no
 * date-picker library needed.
 */
const exampleItemFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be in YYYY-MM-DD format"),
});

type ExampleItemFormValues = z.infer<typeof exampleItemFormSchema>;

export function ExampleItemForm() {
  const { items, isLoading, error, refetch } = useExampleItems();

  const form = useForm<ExampleItemFormValues>({
    resolver: zodResolver(exampleItemFormSchema),
    defaultValues: { title: "", dueDate: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createExampleItem(values);
      form.reset();
      await refetch();
    } catch (err) {
      if (err instanceof ExampleItemValidationError) {
        applyServerFieldErrors(form, err.body.details?.fields ?? {});
        return;
      }
      form.setError("root", {
        type: "server",
        message: err instanceof Error ? err.message : "Failed to create example item",
      });
    }
  });

  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="title" className="text-sm font-medium text-foreground">
            Title
          </label>
          <input
            id="title"
            type="text"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            {...form.register("title")}
          />
          {form.formState.errors.title ? (
            <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="dueDate" className="text-sm font-medium text-foreground">
            Due date
          </label>
          <input
            id="dueDate"
            type="date"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            {...form.register("dueDate")}
          />
          {form.formState.errors.dueDate ? (
            <p className="text-sm text-destructive">{form.formState.errors.dueDate.message}</p>
          ) : null}
        </div>

        {form.formState.errors.root ? (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        ) : null}

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Saving..." : "Add item"}
        </Button>
      </form>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Example items</h2>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="text-sm text-muted-foreground">
              {item.title} — due {item.dueDate}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
