# RED Monitoring Proposal

Date: 2026-09-01
Status: **Research only — not implemented**
Target: `forge` API
Research method: one read-only agent inspected the repository, primary OpenTelemetry guidance, and RED-method material.

## Decision summary

Apply the RED pattern to `apps/api` as a bounded follow-up slice.

Do not add client telemetry to `apps/web`, `apps/mobile`, or `apps/mobile-lynx` in this template version. Do not bundle Prometheus, Grafana, an OpenTelemetry Collector, dashboards, alerts, retention, or a SaaS APM account.

The template should expose production-honest server metrics and verification hooks without claiming to provide a complete monitoring system.

## Why RED fits

RED monitors each service through:

- **Rate:** completed requests over time.
- **Errors:** failed completed requests over time.
- **Duration:** a distribution of request latency.

For this API, one OpenTelemetry duration histogram can support all three signals:

- histogram `_count` provides request rate;
- status and bounded error attributes provide error rate;
- histogram buckets provide p50/p95/p99 duration.

A separate request counter would duplicate the histogram count and is not proposed.

## Current state

### Existing observability seam

- `apps/api/src/otel.ts` initializes `NodeSDK` with a trace exporter only.
- No HTTP request instrumentation, server-span middleware, metric reader, or request metric exists.
- `OTEL_EXPORTER_OTLP_ENDPOINT` currently controls trace export only; it must not silently become a metrics endpoint.
- `apps/api/src/middleware/trace-id.ts` uses an active OTel span trace ID when available, otherwise a generated UUID.
- Normal Hono requests currently have no proven active server span, so `X-Trace-Id` is useful log/error correlation but must not be described as full OTel trace correlation.

### Request/error flow

- `apps/api/src/index.ts` installs security, CORS, trace-ID, and rate-limit middleware globally.
- `apps/api/src/error/on-error.ts` turns known `AppError`s into their configured status and sanitizes unknown errors to `500 common/INTERNAL_ERROR`.
- `apps/api/src/middleware/rate-limit.ts` can return 429 before later handlers run.
- `/health` is liveness only and does not check PostgreSQL readiness.

A RED middleware must run before the existing global middleware so it observes short-circuits, 429 responses, validation/auth errors, unknown 500 responses, 404s, and successful requests.

## Proposed metric

Use the stable OpenTelemetry HTTP server metric:

```text
name: http.server.request.duration
type: Histogram
unit: s
```

Recommended explicit boundaries:

```text
0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25,
0.5, 0.75, 1, 2.5, 5, 7.5, 10
```

Do not use millisecond values with a metric whose unit is seconds. Do not rely on generic SDK default buckets without checking them.

### Attributes

Allowed bounded attributes:

| Attribute | Policy |
|---|---|
| `http.request.method` | Known canonical method; collapse unknown methods to `_OTHER` |
| `url.scheme` | Immediate request URL scheme; do not trust forwarded headers |
| `http.response.status_code` | Final numeric response status |
| `http.route` | Matched route template such as `/projects/{id}`; omit for unmatched/wildcard routes |
| `error.type` | Predictable low-cardinality value for 5xx only, initially the status string |

Never attach:

- raw URL paths or query strings;
- client IPs or forwarded-for values;
- user IDs, emails, tenant IDs, JWTs, or cookies;
- error messages, stack traces, or SQL text;
- trace IDs;
- unbounded domain values.

`AppError.code` is intentionally excluded from the first slice. It may be bounded today, but adding it multiplies histogram series and turns the error taxonomy into an operational compatibility surface.

## Error semantics

Use the server-side OpenTelemetry convention:

- 2xx/3xx are non-errors.
- 4xx, including validation, authentication, 404, and rate-limit 429, remain queryable by status but do not receive `error.type` by default.
- 5xx receive `error.type`.
- An unknown throw sanitized by `onError` must be recorded as status/error 500.

This distinguishes server failure from expected client/auth outcomes without hiding 4xx rates.

## Route cardinality

Use Hono's resolved route template after `await next()`, not `new URL(c.req.url).pathname`.

Dynamic requests such as `/users/a` and `/users/b` must produce one series labeled `/users/:id`. An unmatched wildcard such as `/*` should be treated as no route label rather than a real application route.

Raw paths are forbidden because identifiers embedded in paths create unbounded cardinality and may leak sensitive data.

## Export design

Add an explicit direct dependency aligned with the existing OTel SDK version:

```text
@opentelemetry/exporter-prometheus@0.221.x
```

Configure an explicit Prometheus metric reader in `apps/api/src/otel.ts`.

Proposed environment contract:

```env
OTEL_METRICS_EXPORTER=prometheus
OTEL_EXPORTER_PROMETHEUS_HOST=127.0.0.1
OTEL_EXPORTER_PROMETHEUS_PORT=9464
```

Initially support only:

- `prometheus`: start the scrape listener;
- `none`: do not start a metrics listener.

Bind loopback by default. The direct exporter provides no production authentication or TLS. Binding to a non-loopback address requires deployment-level network policy or a protected reverse proxy.

Do not add Prometheus or Grafana to `docker-compose.yml`. Storage, querying, dashboards, alerting, and retention belong to the deployment environment.

## Health and scrape traffic

Record `/health` honestly, but exclude it from customer-traffic RED queries so frequent probes do not dominate rate and latency.

The Prometheus exporter uses a separate listener. Its `/metrics` traffic must not pass through Hono, recurse into its own metric, or consume the API rate limiter.

Example PromQL after Prometheus name conversion:

```promql
# Request rate excluding liveness probes
sum(rate(http_server_request_duration_count{http_route!="/health"}[5m]))

# Server-error rate
sum(rate(http_server_request_duration_count{
  http_route!="/health",
  error_type!=""
}[5m]))

# p95 request duration
histogram_quantile(
  0.95,
  sum by (le) (
    rate(http_server_request_duration_bucket{http_route!="/health"}[5m])
  )
)
```

## Traces and exemplars

Do not add trace IDs as metric attributes.

Do not promise exemplars in this slice:

- the API has no proven active Hono server span;
- generated UUID trace IDs are not OTel span context;
- exemplar serialization through the selected Prometheus path has not been established.

A later, separate slice may add manual Hono server spans and an exemplar-capable OTLP/OpenMetrics path. Existing `X-Trace-Id`, error-body, and log correlation remains unchanged.

## Expected implementation surface

Proposed files:

- `apps/api/src/middleware/http-server-metrics.ts` — new histogram middleware.
- `apps/api/src/middleware/http-server-metrics.test.ts` — focused behavior/cardinality tests.
- `apps/api/src/index.ts` — mount metrics middleware first.
- `apps/api/src/otel.ts` — explicit metric reader and reliable shutdown.
- `apps/api/src/env.ts` — validate exporter/host/port.
- `apps/api/package.json` and `bun.lock` — direct exporter dependency.
- `.env.example` — documented metrics configuration.
- `scripts/verify.sh` — generated-scaffold scrape and shutdown smoke probe.
- `AGENTS.md` — scrape endpoint, security boundary, and RED query semantics.

Unrelated tests that import the app in-process should set `OTEL_METRICS_EXPORTER=none` where necessary so they do not contend for a listener port.

## Acceptance criteria

1. One completed API request records exactly one histogram observation.
2. Two concrete dynamic paths resolving to one route template produce one route series.
3. No raw paths, query values, users, IPs, secrets, error messages, or trace IDs appear in scraped labels.
4. Statuses 200, representative 4xx, 429, 404, and 500 remain distinguishable.
5. Only 5xx observations receive `error.type` under the initial policy.
6. Unknown errors sanitized through `onError` are recorded as 500.
7. Histogram unit and explicit buckets are seconds and include the recommended sub-second boundaries.
8. `/health` is observable but documented as excluded from customer RED queries.
9. `OTEL_METRICS_EXPORTER=none` opens no scrape listener.
10. SIGTERM shuts down the OTel SDK and allows the Bun process to exit.
11. `bun run typecheck`, `bun run lint`, and `bun test` pass.
12. A fresh scaffold boots the API on temporary ports, requests `/health`, and exposes a nonzero histogram count:

```bash
curl -fsS http://127.0.0.1:9464/metrics \
  | grep http_server_request_duration_count
```

The scrape smoke test is mandatory because OpenTelemetry JS does not officially list Bun as a supported runtime.

## Risks and tradeoffs

- **Bun runtime support:** a read-only research probe succeeded on Bun 1.3.13, but this is compatibility evidence, not an upstream support guarantee.
- **Exporter maturity:** OpenTelemetry metrics and HTTP semantic conventions are stable, while `sdk-node` and the Prometheus exporter remain 0.x package surfaces.
- **Cardinality:** histogram buckets multiply every attribute combination; route templates and bounded attributes are mandatory.
- **Endpoint exposure:** Prometheus target metadata may reveal process/host information. Never expose the listener publicly without network controls.
- **Coverage boundary:** Hono middleware cannot observe connections rejected before Hono, runtime crashes, proxy failures, or dropped transport connections. Infrastructure metrics own those cases.
- **Shutdown:** research observed that the current OTel shutdown handling may leave Bun alive after SIGTERM; implementation must include a direct process-exit probe.

## Non-goals

- Browser RUM or Web Vitals.
- Expo or Lynx telemetry.
- Prometheus/Grafana/Collector deployment.
- Dashboards, alerts, SLO definitions, or retention policy.
- Database, runtime, saturation, queue, or business metrics.
- Changing `/health` into a readiness endpoint.
- Persisting the in-memory auth/rate-limit stores.
- Full request tracing or exemplars.
- Treating every 4xx response as a server error.

## Recommendation

Implement this as one API-only vertical slice before adding broader observability. Estimated complexity is **small to medium**: the code surface is bounded, but Bun compatibility, cardinality, exporter security, and shutdown behavior require direct integration probes.

Do not start implementation until the metric attributes, exporter default (`prometheus` versus `none`), and acceptance criteria above are accepted.

## Sources

- Grafana, “The RED Method”: <https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/>
- OpenTelemetry HTTP server metric semantic conventions: <https://opentelemetry.io/docs/specs/semconv/http/http-metrics/#metric-httpserverrequestduration>
- OpenTelemetry HTTP span/status semantics: <https://opentelemetry.io/docs/specs/semconv/http/http-spans/#status>
- OpenTelemetry metrics data model and exemplars: <https://opentelemetry.io/docs/specs/otel/metrics/data-model/>
- OpenTelemetry JS exporters: <https://opentelemetry.io/docs/languages/js/exporters/#prometheus>
- OpenTelemetry JS supported runtimes: <https://github.com/open-telemetry/opentelemetry-js#supported-runtimes>
