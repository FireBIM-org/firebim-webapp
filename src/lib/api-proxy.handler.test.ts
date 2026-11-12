import type { NextApiRequest, NextApiResponse } from 'next';
import type { AddressInfo } from 'node:net';

import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Runs the real proxy route against a real upstream HTTP server, with only the
 * NextAuth session lookup mocked.
 */

const getServerSession = vi.fn();
vi.mock('next-auth/next', () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock('../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

interface Received {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

let received: Received[] = [];
let upstream: http.Server;
let proxy: http.Server;
let proxyPort: number;

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
  );
}

function upstreamHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    received.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: Buffer.concat(chunks).toString(),
    });
    if (req.url?.startsWith('/slow')) return; // never answers
    if (req.url?.startsWith('/limited')) {
      res.writeHead(429, {
        'content-type': 'application/json',
        'retry-after': '17',
        'x-ratelimit-limit': '20',
        'x-ratelimit-remaining': '0',
        'x-request-id': 'upstream-id',
      });
      res.end(JSON.stringify({ code: 'RATE_LIMITED', detail: 'Rate limit exceeded' }));
      return;
    }
    if (req.url?.startsWith('/download')) {
      const payload = 'x'.repeat(256 * 1024);
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(payload.length),
        'content-disposition': 'attachment; filename="model.ifc"',
      });
      res.end(payload);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
}

interface ClientResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(
  path: string,
  options: { method?: string; headers?: http.OutgoingHttpHeaders; body?: string[] } = {},
): Promise<ClientResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on('error', reject);
    for (const part of options.body ?? []) req.write(part);
    req.end();
  });
}

beforeAll(async () => {
  upstream = http.createServer(upstreamHandler);
  const upstreamPort = await listen(upstream);

  vi.stubEnv('API_BACKEND_URL', `http://127.0.0.1:${upstreamPort}`);
  vi.stubEnv('API_PROXY_TIMEOUT_MS', '300');
  vi.stubEnv('API_PROXY_MAX_BODY_BYTES', '1000');
  const handler = (await import('../pages/api/proxy/[...path]')).default as Handler;

  // Minimal stand-in for Next's API resolver: query parsing plus res.status/res.json.
  proxy = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://proxy.local');
    const apiReq = Object.assign(req, {
      query: { path: url.pathname.replace(/^\/api\/proxy\//, '').split('/') },
    }) as unknown as NextApiRequest;
    const apiRes = Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return apiRes;
      },
      json(body: unknown) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(body));
        return apiRes;
      },
    }) as unknown as NextApiResponse;
    void handler(apiReq, apiRes);
  });
  proxyPort = await listen(proxy);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  upstream.closeAllConnections();
  proxy.closeAllConnections();
  await Promise.all([
    new Promise((resolve) => upstream.close(resolve)),
    new Promise((resolve) => proxy.close(resolve)),
  ]);
});

beforeEach(() => {
  received = [];
  getServerSession.mockReset();
  getServerSession.mockResolvedValue({ accessToken: 'access-token' });
});

describe('API proxy route', () => {
  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await request('/api/proxy/models');
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).code).toBe('NOT_AUTHENTICATED');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(received).toHaveLength(0);
  });

  it('forwards auth, client IP, request id and trace headers, but not cookies', async () => {
    const res = await request('/api/proxy/models?limit=5', {
      headers: {
        accept: 'application/json',
        'x-forwarded-for': '203.0.113.9',
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        cookie: 'next-auth.session-token=secret',
      },
    });

    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
    const { headers, url } = received[0];
    expect(url).toBe('/models?limit=5');
    expect(headers.authorization).toBe('Bearer access-token');
    expect(headers['x-forwarded-for']).toBe('203.0.113.9, 127.0.0.1');
    expect(headers.traceparent).toBe('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    expect(headers.accept).toBe('application/json');
    expect(headers.cookie).toBeUndefined();
    expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-request-id']).toBe(headers['x-request-id']);
  });

  it('keeps an incoming X-Request-ID', async () => {
    const res = await request('/api/proxy/models', { headers: { 'x-request-id': 'abc-123' } });
    expect(received[0].headers['x-request-id']).toBe('abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('streams a request body through to the API', async () => {
    const res = await request('/api/proxy/models', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'transfer-encoding': 'chunked' },
      body: ['part-1;', 'part-2'],
    });
    expect(res.status).toBe(200);
    expect(received[0].method).toBe('POST');
    expect(received[0].body).toBe('part-1;part-2');
    expect(received[0].headers['content-type']).toBe('text/plain');
  });

  it('rejects a declared oversize body with 413 before contacting the API', async () => {
    const res = await request('/api/proxy/models', {
      method: 'POST',
      headers: { 'content-length': '5000' },
    });
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body).code).toBe('PAYLOAD_TOO_LARGE');
    expect(received).toHaveLength(0);
  });

  it('rejects an oversize chunked body with 413 while streaming', async () => {
    const res = await request('/api/proxy/models', {
      method: 'POST',
      headers: { 'transfer-encoding': 'chunked' },
      body: ['a'.repeat(600), 'b'.repeat(600)],
    });
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('mirrors rate-limit headers and the error body', async () => {
    const res = await request('/api/proxy/limited');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('17');
    expect(res.headers['x-ratelimit-limit']).toBe('20');
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(res.headers['x-request-id']).toBe('upstream-id');
    expect(JSON.parse(res.body)).toEqual({ code: 'RATE_LIMITED', detail: 'Rate limit exceeded' });
  });

  it('streams downloads back with length and disposition', async () => {
    const res = await request('/api/proxy/download');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(256 * 1024);
    expect(res.headers['content-length']).toBe(String(256 * 1024));
    expect(res.headers['content-disposition']).toBe('attachment; filename="model.ifc"');
  });

  it('returns 504 when the API does not answer in time', async () => {
    const res = await request('/api/proxy/slow');
    expect(res.status).toBe(504);
    expect(JSON.parse(res.body).code).toBe('UPSTREAM_TIMEOUT');
  });
});
