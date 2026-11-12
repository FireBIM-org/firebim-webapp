import { parsePositiveInt } from './api-proxy';

/**
 * Pure helpers for the aggregate health endpoint (src/pages/api/health.ts).
 * Kept free of Next.js imports so the timeout and aggregation logic can be unit tested.
 *
 * /api/health is for humans, blackbox probes and dashboards. Kubernetes probes use
 * /api/livez, so a slow API or an Authentik outage never restarts the webapp.
 */

/**
 * Wait for the API's /health. That endpoint checks the database, S3, Celery and Authentik
 * itself and has taken ~5 s in production, so this must stay well above its response time.
 */
export const DEFAULT_HEALTH_API_TIMEOUT_MS = 8_000;
/** Wait for Authentik's OIDC discovery document (a static JSON document). */
export const AUTHENTIK_DISCOVERY_TIMEOUT_MS = 5_000;

export interface HealthCheck {
  /** `ok`, `not configured`, or `error: …`. */
  status: string;
  /** Time until the response headers arrived (or the check failed); null if not run. */
  latency_ms: number | null;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: Record<string, HealthCheck>;
}

export interface HealthConfig {
  apiTimeoutMs: number;
  authentikTimeoutMs: number;
}

export function resolveHealthConfig(env: Record<string, string | undefined>): HealthConfig {
  return {
    apiTimeoutMs: parsePositiveInt(env.HEALTH_API_TIMEOUT_MS, DEFAULT_HEALTH_API_TIMEOUT_MS),
    authentikTimeoutMs: AUTHENTIK_DISCOVERY_TIMEOUT_MS,
  };
}

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export const NOT_CONFIGURED: HealthCheck = { status: 'not configured', latency_ms: null };

/**
 * GETs `url` and reports `ok` for a 2xx answer within `timeoutMs`. Never throws: timeouts,
 * network errors and non-2xx answers become an `error: …` status. Only the status line is
 * needed, so the response body is discarded.
 */
export async function runHealthCheck(
  url: string,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
  now: () => number = () => performance.now(),
): Promise<HealthCheck> {
  const started = now();
  const elapsed = () => Math.round(now() - started);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Settles the check at the deadline even if the fetch ignores the abort signal.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timeout after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    const resp = await Promise.race([fetchImpl(url, { signal: controller.signal }), deadline]);
    const latency_ms = elapsed();
    void resp.body?.cancel().catch(() => undefined);
    return resp.ok
      ? { status: 'ok', latency_ms }
      : { status: `error: HTTP ${resp.status}`, latency_ms };
  } catch (error) {
    const latency_ms = elapsed();
    if (controller.signal.aborted) {
      return { status: `error: timeout after ${timeoutMs} ms`, latency_ms };
    }
    console.error(`Health check failed for ${url}:`, error);
    return { status: 'error: unreachable', latency_ms };
  } finally {
    clearTimeout(timer);
  }
}

/** Healthy when every check is `ok` or `not configured`. */
export function aggregateHealth(checks: Record<string, HealthCheck>): {
  httpStatus: 200 | 503;
  report: HealthReport;
} {
  const healthy = Object.values(checks).every(
    (check) => check.status === 'ok' || check.status === NOT_CONFIGURED.status,
  );
  return {
    httpStatus: healthy ? 200 : 503,
    report: { status: healthy ? 'ok' : 'degraded', checks },
  };
}
