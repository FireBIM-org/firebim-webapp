import { describe, expect, it, vi } from 'vitest';

import {
  PayloadTooLargeError,
  buildForwardedFor,
  buildUpstreamHeaders,
  buildUpstreamUrl,
  exceedsBodyLimit,
  hasRequestBody,
  limitBody,
  normalizeIp,
  parsePositiveInt,
  pickResponseHeaders,
  resolveRequestId,
} from './api-proxy';

async function collect(source: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

async function* chunks(...parts: string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield Buffer.from(part);
}

describe('buildUpstreamUrl', () => {
  const backend = 'http://firebim-api:8000';

  it('appends the segments to the backend URL', () => {
    expect(buildUpstreamUrl(backend, ['ifc-models', '42', 'download'])?.href).toBe(
      'http://firebim-api:8000/ifc-models/42/download',
    );
    expect(buildUpstreamUrl(`${backend}/`, ['users', 'me'])?.href).toBe(
      'http://firebim-api:8000/users/me',
    );
    expect(buildUpstreamUrl(`${backend}/prefix/`, ['users'])?.href).toBe(
      'http://firebim-api:8000/prefix/users',
    );
  });

  it('re-encodes decoded segments', () => {
    expect(buildUpstreamUrl(backend, ['lexicon', 'profiles', 'a b/c?d#e'])?.pathname).toBe(
      '/lexicon/profiles/a%20b%2Fc%3Fd%23e',
    );
  });

  it('never leaves the backend origin for absolute or protocol-relative segments', () => {
    for (const segments of [
      ['http://evil.example/steal'],
      ['//evil.example/steal'],
      ['https:', 'evil.example', 'x'],
      ['', '', 'evil.example', 'x'],
      ['\\\\evil.example\\x'],
    ]) {
      const url = buildUpstreamUrl(backend, segments);
      expect(url?.origin).toBe('http://firebim-api:8000');
    }
  });

  it('rejects dot segments', () => {
    expect(buildUpstreamUrl(backend, ['..', 'admin'])).toBeNull();
    expect(buildUpstreamUrl(`${backend}/prefix`, ['models', '.', 'x'])).toBeNull();
  });
});

describe('parsePositiveInt', () => {
  it('falls back for unset, empty, invalid and non-positive values', () => {
    expect(parsePositiveInt(undefined, 5)).toBe(5);
    expect(parsePositiveInt('', 5)).toBe(5);
    expect(parsePositiveInt('abc', 5)).toBe(5);
    expect(parsePositiveInt('0', 5)).toBe(5);
    expect(parsePositiveInt('-10', 5)).toBe(5);
    expect(parsePositiveInt('1.5', 5)).toBe(5);
  });

  it('parses positive integers', () => {
    expect(parsePositiveInt('120000', 5)).toBe(120000);
    expect(parsePositiveInt(' 42 ', 5)).toBe(42);
  });
});

describe('normalizeIp', () => {
  it('strips the IPv4-mapped IPv6 prefix', () => {
    expect(normalizeIp('::ffff:10.42.0.7')).toBe('10.42.0.7');
    expect(normalizeIp('10.42.0.7')).toBe('10.42.0.7');
    expect(normalizeIp('::1')).toBe('::1');
    expect(normalizeIp(undefined)).toBeUndefined();
  });
});

describe('buildForwardedFor', () => {
  it('appends the peer address to an existing chain', () => {
    expect(buildForwardedFor('203.0.113.9, 10.42.0.3', '::ffff:10.42.0.12')).toBe(
      '203.0.113.9, 10.42.0.3, 10.42.0.12',
    );
  });

  it('starts a chain when none is present', () => {
    expect(buildForwardedFor(undefined, '10.42.0.12')).toBe('10.42.0.12');
  });

  it('joins repeated headers and drops empty entries', () => {
    expect(buildForwardedFor(['1.1.1.1', ' , 2.2.2.2'], '3.3.3.3')).toBe(
      '1.1.1.1, 2.2.2.2, 3.3.3.3',
    );
  });

  it('does not repeat a peer that Next already put into the header', () => {
    expect(buildForwardedFor('::ffff:10.42.0.12', '::ffff:10.42.0.12')).toBe('10.42.0.12');
    expect(buildForwardedFor('203.0.113.9, 10.42.0.12', '10.42.0.12')).toBe(
      '203.0.113.9, 10.42.0.12',
    );
  });

  it('returns undefined when there is nothing to forward', () => {
    expect(buildForwardedFor(undefined, undefined)).toBeUndefined();
  });
});

describe('resolveRequestId', () => {
  it('reuses a well-formed incoming id', () => {
    expect(resolveRequestId('abc-123', () => 'generated')).toBe('abc-123');
    expect(resolveRequestId(['first', 'second'], () => 'generated')).toBe('first');
  });

  it('generates an id when missing or malformed', () => {
    expect(resolveRequestId(undefined, () => 'generated')).toBe('generated');
    expect(resolveRequestId('has spaces', () => 'generated')).toBe('generated');
    expect(resolveRequestId('x'.repeat(129), () => 'generated')).toBe('generated');
  });

  it('defaults to a random UUID', () => {
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('buildUpstreamHeaders', () => {
  it('forwards only the allow-listed headers and adds proxy headers', () => {
    const headers = buildUpstreamHeaders(
      {
        'content-type': 'multipart/form-data; boundary=x',
        accept: 'application/json',
        'accept-language': 'da-DK',
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        tracestate: 'vendor=1',
        'x-forwarded-for': '203.0.113.9',
        'x-request-id': 'ignored-here',
        cookie: 'next-auth.session-token=secret',
        host: 'app.firebim.org',
        'content-length': '123',
      },
      { accessToken: 'tok', requestId: 'req-1', remoteAddress: '10.42.0.5' },
    );

    expect(headers).toEqual({
      'content-type': 'multipart/form-data; boundary=x',
      accept: 'application/json',
      'accept-language': 'da-DK',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'vendor=1',
      'x-forwarded-for': '203.0.113.9, 10.42.0.5',
      'x-request-id': 'req-1',
      authorization: 'Bearer tok',
      'accept-encoding': 'identity',
    });
  });
});

describe('pickResponseHeaders', () => {
  it('mirrors the allow-listed and rate-limit headers', () => {
    const upstream = new Headers({
      'content-type': 'application/json',
      'content-length': '42',
      'content-disposition': 'attachment; filename="a.ifc"',
      'cache-control': 'no-store',
      'retry-after': '30',
      'x-request-id': 'req-1',
      'x-ratelimit-limit': '300',
      'x-ratelimit-remaining': '0',
      'set-cookie': 'a=b',
      server: 'uvicorn',
    });

    expect(Object.fromEntries(pickResponseHeaders(upstream))).toEqual({
      'content-type': 'application/json',
      'content-length': '42',
      'content-disposition': 'attachment; filename="a.ifc"',
      'cache-control': 'no-store',
      'retry-after': '30',
      'x-request-id': 'req-1',
      'x-ratelimit-limit': '300',
      'x-ratelimit-remaining': '0',
    });
  });

  it('drops Content-Length for encoded responses', () => {
    const upstream = new Headers({ 'content-length': '42', 'content-encoding': 'gzip' });
    expect(pickResponseHeaders(upstream)).toEqual([]);
  });
});

describe('hasRequestBody', () => {
  it('never sends a body for GET/HEAD', () => {
    expect(hasRequestBody('GET', { 'content-length': '10' })).toBe(false);
    expect(hasRequestBody('HEAD', { 'transfer-encoding': 'chunked' })).toBe(false);
  });

  it('detects declared or chunked bodies', () => {
    expect(hasRequestBody('POST', { 'content-length': '10' })).toBe(true);
    expect(hasRequestBody('PUT', { 'transfer-encoding': 'chunked' })).toBe(true);
    expect(hasRequestBody('DELETE', { 'content-length': '0' })).toBe(false);
    expect(hasRequestBody('DELETE', {})).toBe(false);
  });
});

describe('exceedsBodyLimit', () => {
  it('compares the declared length with the limit', () => {
    expect(exceedsBodyLimit(undefined, 10)).toBe(false);
    expect(exceedsBodyLimit('10', 10)).toBe(false);
    expect(exceedsBodyLimit('11', 10)).toBe(true);
    expect(exceedsBodyLimit('garbage', 10)).toBe(false);
  });
});

describe('limitBody', () => {
  it('passes the body through when within the limit', async () => {
    const onComplete = vi.fn();
    const onLimitExceeded = vi.fn();
    const result = await collect(
      limitBody(chunks('hello ', 'world'), 11, { onComplete, onLimitExceeded }),
    );
    expect(result).toBe('hello world');
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onLimitExceeded).not.toHaveBeenCalled();
  });

  it('accepts string chunks', async () => {
    async function* strings() {
      yield 'ab';
      yield 'c';
    }
    expect(await collect(limitBody(strings(), 3))).toBe('abc');
  });

  it('throws PayloadTooLargeError as soon as the running total exceeds the limit', async () => {
    const onComplete = vi.fn();
    const onLimitExceeded = vi.fn();
    const seen: string[] = [];
    const run = async () => {
      for await (const chunk of limitBody(chunks('12345', '67890', 'never'), 8, {
        onComplete,
        onLimitExceeded,
      })) {
        seen.push(Buffer.from(chunk).toString());
      }
    };

    await expect(run()).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(seen).toEqual(['12345']);
    expect(onLimitExceeded).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
