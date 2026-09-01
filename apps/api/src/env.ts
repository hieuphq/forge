import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1).optional(),
  // When set, the OTel seam (src/otel.ts) swaps the default
  // ConsoleSpanExporter for an OTLP/HTTP exporter pointed at this endpoint.
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).optional(),
  // Comma-separated list of allowed CORS origins, e.g.
  // "http://localhost:5173,https://app.example.com". Never "*".
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1, "CORS_ALLOWED_ORIGINS is required")
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const missing = err.issues
        .map((issue) => issue.path.join(".") || "(root)")
        .join(", ");
      console.error(
        `[env] Invalid environment configuration. Failed key(s): ${missing}`,
      );
      for (const issue of err.issues) {
        console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw err;
  }
}

export const env = loadEnv();
