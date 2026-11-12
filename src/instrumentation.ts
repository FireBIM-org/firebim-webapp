import { registerOTel } from '@vercel/otel';

/**
 * OpenTelemetry for the Next.js server (picked up automatically by Next).
 *
 * Configured from the standard OTEL_* env vars (endpoint, protocol, sampler, resource attributes).
 * Telemetry is a complete no-op unless an OTLP endpoint is set, so local dev and tests are unaffected.
 */
export function register() {
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || process.env.OTEL_SDK_DISABLED?.toLowerCase() === 'true') return;

  const apiBackend = process.env.API_BACKEND_URL || 'http://localhost:8000';

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'firebim-webapp',
    instrumentationConfig: {
      fetch: {
        // The API proxy creates its own client span and injects traceparent itself.
        // The generic fetch instrumentation clones every response body to measure it,
        // which would buffer large streamed downloads in memory.
        ignoreUrls: [apiBackend],
      },
    },
  });
}
