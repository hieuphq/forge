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
import { readFileSync } from "node:fs";
import path from "node:path";

// Un-personalised boot guard. A scaffolded project that never ran
// `bun run setup` (path A's second, forgettable command) would otherwise
// boot silently with `@yourorg/*` package names and no real JWT_SECRET.
function assertPersonalised(): void {
  // apps/api/src/index.ts -> repo root is three levels up.
  const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json");
  let rootPkgName: string | undefined;
  try {
    rootPkgName = JSON.parse(readFileSync(rootPkgPath, "utf8")).name;
  } catch {
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

export default {
  fetch: app.fetch,
  port: env.PORT,
};
