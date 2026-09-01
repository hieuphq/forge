import { prisma } from "../../db/prisma";

export interface ExampleItem {
  id: string;
  title: string;
  /** SQL DATE serialized as YYYY-MM-DD, never as an instant. */
  dueDate: string;
}

type ExampleItemRow = ExampleItem;

export async function createExampleItem(title: string, dueDate: string): Promise<ExampleItem> {
  const id = crypto.randomUUID();
  const rows = await prisma.$queryRaw<ExampleItemRow[]>`
    INSERT INTO "example_items" ("id", "title", "due_date")
    VALUES (${id}::uuid, ${title}, ${dueDate}::date)
    RETURNING "id"::text AS "id", "title", "due_date"::text AS "dueDate"
  `;
  return rows[0]!;
}

export async function listExampleItems(): Promise<ExampleItem[]> {
  return prisma.$queryRaw<ExampleItemRow[]>`
    SELECT "id"::text AS "id", "title", "due_date"::text AS "dueDate"
    FROM "example_items"
    ORDER BY "created_at", "id"
  `;
}
