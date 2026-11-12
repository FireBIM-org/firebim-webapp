import type { NextApiRequest, NextApiResponse } from 'next';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Runs the real /api/health route with a stubbed global fetch, to check the wiring:
 * the URLs called, the timeouts used and the response written.
 */

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

function fakeResponse() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

async function loadHandler(env: Record<string, string>): Promise<Handler> {
  vi.resetModules();
  vi.stubEnv('AUTHENTIK_INTERNAL_ISSUER_URL', '');
  vi.stubEnv('AUTHENTIK_ISSUER_URL', '');
  vi.stubEnv('HEALTH_API_TIMEOUT_MS', '');
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import('../pages/api/health')).default as Handler;
}

async function call(handler: Handler) {
  const res = fakeResponse();
  await handler({} as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('/api/health', () => {
  it('checks the API and Authentik and reports each latency', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const handler = await loadHandler({
      API_BACKEND_URL: 'http://firebim-api:8000/',
      AUTHENTIK_INTERNAL_ISSUER_URL: 'http://authentik/application/o/firebim/',
    });

    const res = await call(handler);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://firebim-api:8000/health',
      'http://authentik/application/o/firebim/.well-known/openid-configuration',
    ]);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      status: 'ok',
      checks: {
        api: { status: 'ok', latency_ms: expect.any(Number) },
        authentik: { status: 'ok', latency_ms: expect.any(Number) },
      },
    });
  });

  it('reports Authentik as not configured without an issuer URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}')),
    );
    const res = await call(await loadHandler({ API_BACKEND_URL: 'http://firebim-api:8000' }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      checks: { authentik: { status: 'not configured', latency_ms: null } },
    });
  });

  it('waits HEALTH_API_TIMEOUT_MS for the API and 5 s for Authentik', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason));
          }),
      ),
    );
    const handler = await loadHandler({
      API_BACKEND_URL: 'http://firebim-api:8000',
      AUTHENTIK_ISSUER_URL: 'https://auth.example/application/o/firebim',
      HEALTH_API_TIMEOUT_MS: '9000',
    });

    const pending = call(handler);
    await vi.advanceTimersByTimeAsync(9_000);
    const res = await pending;

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      status: 'degraded',
      checks: {
        api: { status: 'error: timeout after 9000 ms', latency_ms: 9_000 },
        authentik: { status: 'error: timeout after 5000 ms', latency_ms: 5_000 },
      },
    });
  });
});
