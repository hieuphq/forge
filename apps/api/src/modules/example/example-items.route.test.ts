import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { OpenAPIHono } from "@hono/zod-openapi";
import { onError } from "../../error/on-error";
import { traceIdMiddleware } from "../../middleware/trace-id";
import { exampleItemsApp } from "./example-items.route";
import { prisma } from "../../db/prisma";

beforeEach(async () => {
  await prisma.exampleItem.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Standalone `OpenAPIHono` app for testing `/example-items` in isolation,
 * mirroring `validate-example.route.test.ts`'s pattern: re-compose a fresh
 * app with the SAME middleware + error handler as the real one.
 */
function buildTestApp() {
  const app = new OpenAPIHono();

  app.use("*", traceIdMiddleware);
  app.onError(onError);
  app.route("/", exampleItemsApp);

  return app;
}

describe("POST /example-items", () => {
  it("creates an item with a valid dueDate, returned unchanged as a string", async () => {
    const app = buildTestApp();

    const res = await app.request("/example-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Ship the report", dueDate: "2026-03-01" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; title: string; dueDate: string };
    expect(body.id).toBeTruthy();
    expect(body.title).toBe("Ship the report");
    // The calendar-date field must survive round-trip as the exact same
    // string — never coerced through a `Date` object.
    expect(body.dueDate).toBe("2026-03-01");
    expect(typeof body.dueDate).toBe("string");
  });

  it("rejects a malformed dueDate (wrong separators) as common/VALIDATION_FAILED", async () => {
    const app = buildTestApp();

    const res = await app.request("/example-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Ship the report", dueDate: "03/01/2026" }),
    });

    expect(res.status).toBe(400);

    const headerTraceId = res.headers.get("X-Trace-Id");
    expect(headerTraceId).toBeTruthy();

    const body = (await res.json()) as {
      code: string;
      message: string;
      traceId: string;
      details?: { fields?: Record<string, string[]> };
    };

    expect(body.code).toBe("common/VALIDATION_FAILED");
    expect(typeof body.message).toBe("string");
    expect(body.traceId).toBe(headerTraceId as string);
    expect(body.details?.fields?.dueDate).toBeDefined();
    expect(body.details?.fields?.dueDate?.length).toBeGreaterThan(0);
  });

  it("rejects a non-date dueDate string as common/VALIDATION_FAILED", async () => {
    const app = buildTestApp();

    const res = await app.request("/example-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Ship the report", dueDate: "not-a-date" }),
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as {
      code: string;
      details?: { fields?: Record<string, string[]> };
    };

    expect(body.code).toBe("common/VALIDATION_FAILED");
    expect(body.details?.fields?.dueDate).toBeDefined();
  });

  it("rejects an empty title as common/VALIDATION_FAILED", async () => {
    const app = buildTestApp();

    const res = await app.request("/example-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", dueDate: "2026-03-01" }),
    });

    expect(res.status).toBe(400);

    const body = (await res.json()) as {
      code: string;
      details?: { fields?: Record<string, string[]> };
    };

    expect(body.code).toBe("common/VALIDATION_FAILED");
    expect(body.details?.fields?.title).toBeDefined();
  });
});

describe("GET /example-items", () => {
  it("lists previously created items", async () => {
    const app = buildTestApp();

    await app.request("/example-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "First item", dueDate: "2026-01-15" }),
    });
    await app.request("/example-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Second item", dueDate: "2026-02-20" }),
    });

    const res = await app.request("/example-items", { method: "GET" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { title: string; dueDate: string }[] };
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items.some((item) => item.title === "First item" && item.dueDate === "2026-01-15")).toBe(
      true,
    );
    expect(body.items.some((item) => item.title === "Second item" && item.dueDate === "2026-02-20")).toBe(
      true,
    );
  });
});
