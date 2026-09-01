// OTel SDK must be initialized before anything else, so it can observe
// everything else. Keep this import first.
import "./otel";

import { OpenAPIHono } from "@hono/zod-openapi";
import { env } from "./env";
import {
  corsMiddleware,
  rateLimitMiddleware,
  securityHeaders,
} from "./middleware/security";
import { traceIdMiddleware } from "./middleware/trace-id";
import { onError } from "./error/on-error";
import { authApp } from "./modules/auth/auth.route";
import { projectsApp } from "./modules/projects/projects.route";
import { eventsApp } from "./modules/events/events";
import { readFileSync } from "node:fs";
import path from "node:path";

// Un-personalised boot guard. A scaffolded project that never ran
// `bun run setup` (path A's second, forgettable command) would otherwise
// boot silently with `@yourorg/*` package names and no real JWT_SECRET.
//
// Note on placement: ES module static imports (the ones above, including
// "./otel" and "./env") are fully evaluated — dependency-first, in source
// order — before ANY of this module's own top-level statements run, no
// matter where in this file those statements are written. So this check
// necessarily runs after "./otel" and "./env" have already been evaluated,
// not strictly "before anything else" — the earliest a same-file check can
// run is as the first statement right after the import list, which is what
// this is. (A guard that truly pre-empts those imports would need to live
// in its own module imported ahead of "./otel", which is out of scope here
// per the task's file allowlist.)
function assertPersonalised(): void {
  // apps/api/src/index.ts -> repo root is three levels up.
  const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json");
  let rootPkgName: string | undefined;
  try {
    rootPkgName = JSON.parse(readFileSync(rootPkgPath, "utf8")).name;
  } catch {
    // Can't read/parse the root package.json — don't block boot on this
    // guard, let normal startup surface the real error instead.
    return;
  }
  if (rootPkgName === "forge") {
    console.error(
      "[setup] this project has not been personalised yet — run 'bun run setup' first.",
    );
    process.exit(1);
  }
}

if (import.meta.main) assertPersonalised();

// Named export so tests can call `app.request(...)` in-process without
// spinning up a real TCP server.
//
// `OpenAPIHono` (from `@hono/zod-openapi`) is a drop-in-ish superset of the
// base `Hono` class (TASK-012): same `.use`/`.get`/`.onError`/`.request`
// surface, plus `.openapi()` for schema-validated routes. Swapped in here
// so `createRoute`-defined routes can be mounted directly on `app`.
export const app = new OpenAPIHono();

app.use("*", securityHeaders);
app.use("*", corsMiddleware);
app.use("*", traceIdMiddleware);
app.use("*", rateLimitMiddleware);

app.onError(onError);

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/", authApp);
app.route("/", projectsApp);
app.route("/", eventsApp);

export default {
  fetch: app.fetch,
  port: env.PORT,
};
