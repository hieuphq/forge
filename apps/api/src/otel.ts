/**
 * OpenTelemetry bootstrap — the "swappable seam" TASK-011 calls for.
 *
 * By default spans go to a `ConsoleSpanExporter` (stdout), which is fine for
 * local dev and keeps this template dependency-light on any particular APM
 * vendor. Setting `OTEL_EXPORTER_OTLP_ENDPOINT` swaps in an OTLP/HTTP
 * exporter instead — pointing at Honeycomb, Jaeger, an OTel Collector,
 * whatever the deployer wants — with zero code changes, just the env var.
 *
 * This file must be imported FIRST in `index.ts`, before any other module
 * that might create spans, so the SDK is registered before anything else
 * runs.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

/**
 * The seam: OTLP exporter when an endpoint is configured, otherwise a
 * console exporter. No vendor-specific SDK involved either way.
 */
const traceExporter: SpanExporter = otlpEndpoint
  ? new OTLPTraceExporter({ url: otlpEndpoint })
  : new ConsoleSpanExporter();

const sdk = new NodeSDK({
  serviceName: "@yourorg/api",
  traceExporter,
});

sdk.start();

// Best-effort flush on shutdown so the last spans of a process aren't lost.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    sdk
      .shutdown()
      .catch((err) => console.error("[otel] error shutting down SDK", err));
  });
}

export { sdk };
