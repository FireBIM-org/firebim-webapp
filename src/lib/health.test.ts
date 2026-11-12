import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTHENTIK_DISCOVERY_TIMEOUT_MS,
  DEFAULT_HEALTH_API_TIMEOUT_MS,
  type FetchLike,
  NOT_CONFIGURED,
  aggregateHealth,
  resolveHealthConfig,
  runHealthCheck,
} from './health';

/** A clock that advances by `step` ms on every read. */
function steppingClock(step: number): () => number {
  let t = 1_000;
  return () => {
    const value = t;
    t += step;
    return value;
  };
}

/** A fetch that only settles when its signal aborts, like a hung upstream. */
const hangingFetch: FetchLike = (_url, { signal }) =>
  new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason));
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('resolveHealthConfig', () => {
  it('defaults to 8 s for the API and 5 s for Authentik', () => {
    expect(resolveHealthConfig({})).toEqual({ apiTimeoutMs: 8_000, authentikTimeoutMs: 5_000 });
    expect(DEFAULT_HEALTH_API_TIMEOUT_MS).toBe(8_000);
    expect(AUTHENTIK_DISCOVERY_TIMEOUT_MS).toBe(5_000);
  });

  it('reads HEALTH_API_TIMEOUT_MS', () => {
    expect(resolveHealthConfig({ HEALTH_API_TIMEOUT_MS: '12000' }).apiTimeoutMs).toBe(12_000);
  });

  it.each(['', ' ', 'abc', '0', '-5', '1.5'])('ignores invalid value %j', (value) => {
    expect(resolveHealthConfig({ HEALTH_API_TIMEOUT_MS: value }).apiTimeoutMs).toBe(8_000);
  });
});

describe('runHealthCheck', () => {
  it('reports ok with the latency for a 2xx answer', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response('{"status":"ok"}'));
    const check = await runHealthCheck('http://api/health', 8_000, fetchImpl, steppingClock(42));
    expect(check).toEqual({ status: 'ok', latency_ms: 42 });
    expect(fetchImpl).toHaveBeenCalledWith('http://api/health', {
      signal: expect.any(AbortSignal),
    });
  });

  it('reports the HTTP status for a non-2xx answer', async () => {
    const fetchImpl: FetchLike = async () => new Response('degraded', { status: 503 });
    expect(await runHealthCheck('http://api/health', 8_000, fetchImpl, steppingClock(7))).toEqual({
      status: 'error: HTTP 503',
      latency_ms: 7,
    });
  });

  it('reports unreachable for a network error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await runHealthCheck('http://api/health', 8_000, fetchImpl, steppingClock(3))).toEqual({
      status: 'error: unreachable',
      latency_ms: 3,
    });
  });

  it('aborts the request and reports a timeout at the deadline', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl: FetchLike = (url, init) => {
      signal = init.signal;
      return hangingFetch(url, init);
    };
    const pending = runHealthCheck('http://api/health', 8_000, fetchImpl);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const check = await pending;
    expect(signal?.aborted).toBe(true);
    expect(check.status).toBe('error: timeout after 8000 ms');
    expect(check.latency_ms).toBe(8_000);
  });

  it('settles at the deadline even if the fetch ignores the abort signal', async () => {
    vi.useFakeTimers();
    const fetchImpl: FetchLike = () => new Promise(() => undefined);
    const pending = runHealthCheck('http://authentik/.well-known', 5_000, fetchImpl);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await pending).status).toBe('error: timeout after 5000 ms');
  });

  it('accepts a slow API answer that arrives before the deadline', async () => {
    vi.useFakeTimers();
    // Production's API /health took ~5.2 s, which the old 3 s timeout turned into a 503.
    const fetchImpl: FetchLike = () =>
      new Promise((resolve) => setTimeout(() => resolve(new Response('ok')), 5_200));
    const pending = runHealthCheck('http://api/health', DEFAULT_HEALTH_API_TIMEOUT_MS, fetchImpl);
    await vi.advanceTimersByTimeAsync(5_200);
    expect(await pending).toEqual({ status: 'ok', latency_ms: 5_200 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards the response body', async () => {
    const response = new Response('large body');
    const cancel = vi.spyOn(response.body!, 'cancel');
    await runHealthCheck('http://api/health', 8_000, async () => response);
    expect(cancel).toHaveBeenCalled();
  });
});

describe('aggregateHealth', () => {
  const ok = { status: 'ok', latency_ms: 12 };

  it('is ok when every check is ok', () => {
    expect(aggregateHealth({ api: ok, authentik: ok })).toEqual({
      httpStatus: 200,
      report: { status: 'ok', checks: { api: ok, authentik: ok } },
    });
  });

  it('treats an unconfigured dependency as healthy', () => {
    const result = aggregateHealth({ api: ok, authentik: NOT_CONFIGURED });
    expect(result.httpStatus).toBe(200);
    expect(result.report.checks.authentik).toEqual({ status: 'not configured', latency_ms: null });
  });

  it.each([
    ['error: HTTP 503', 'api'],
    ['error: timeout after 8000 ms', 'api'],
    ['error: unreachable', 'authentik'],
  ])('is degraded (503) when a check reports %s', (status, name) => {
    const result = aggregateHealth({ api: ok, authentik: ok, [name]: { status, latency_ms: 1 } });
    expect(result.httpStatus).toBe(503);
    expect(result.report.status).toBe('degraded');
  });
});
