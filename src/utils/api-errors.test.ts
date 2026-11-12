import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  getApiErrorInfo,
  getApiErrorMessage,
  getLimitErrorMessage,
  getUploadErrorMessage,
  isNonRetryableError,
  parseRetryAfter,
  shouldRetryQuery,
} from './api-errors';

function axiosError(
  status: number,
  data: unknown = {},
  headers: Record<string, string> = {},
): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: '',
    data,
    headers: new AxiosHeaders(headers),
    config,
  });
}

describe('parseRetryAfter', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfter('30')).toBe(30);
    expect(parseRetryAfter(' 5 ')).toBe(5);
    expect(parseRetryAfter(12.2)).toBe(13);
  });

  it('parses an HTTP-date relative to now', () => {
    const now = Date.parse('2026-11-12T12:00:00Z');
    expect(parseRetryAfter('Thu, 12 Nov 2026 12:00:45 GMT', now)).toBe(45);
    expect(parseRetryAfter('Thu, 12 Nov 2026 11:00:00 GMT', now)).toBe(0);
  });

  it('ignores missing or invalid values', () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});

describe('getLimitErrorMessage', () => {
  it('maps 429 with Retry-After', () => {
    const error = axiosError(429, { code: 'RATE_LIMITED' }, { 'retry-after': '30' });
    expect(getLimitErrorMessage(error)).toBe('Too many requests — try again in 30 s');
  });

  it('maps 429 without Retry-After', () => {
    expect(getLimitErrorMessage(axiosError(429))).toBe(
      'Too many requests — please try again shortly',
    );
  });

  it('maps 413 / PAYLOAD_TOO_LARGE', () => {
    expect(getLimitErrorMessage(axiosError(413, { code: 'PAYLOAD_TOO_LARGE' }))).toBe(
      'File/request too large',
    );
    expect(getLimitErrorMessage(axiosError(413, 'Request Entity Too Large'))).toBe(
      'File/request too large',
    );
  });

  it('maps 507 storage codes', () => {
    expect(getLimitErrorMessage(axiosError(507, { code: 'STORAGE_LIMIT_EXCEEDED' }))).toBe(
      'Storage limit reached — contact support',
    );
    expect(getLimitErrorMessage(axiosError(507, { code: 'USER_QUOTA_EXCEEDED' }))).toBe(
      'Your storage quota is full — contact support',
    );
    expect(getLimitErrorMessage(axiosError(507))).toBe('Storage limit reached — contact support');
  });

  it('maps the JSON error text thrown by the fetch-based clients', () => {
    const error = new Error(JSON.stringify({ code: 'STORAGE_LIMIT_EXCEEDED', detail: 'full' }));
    expect(getLimitErrorMessage(error)).toBe('Storage limit reached — contact support');
    expect(getApiErrorInfo(error)).toEqual({ code: 'STORAGE_LIMIT_EXCEEDED', detail: 'full' });
  });

  it('returns null for other errors', () => {
    expect(getLimitErrorMessage(axiosError(404, { detail: 'Not found' }))).toBeNull();
    expect(getLimitErrorMessage(new Error('{not json'))).toBeNull();
    expect(getLimitErrorMessage(new Error('boom'))).toBeNull();
    expect(getLimitErrorMessage('boom')).toBeNull();
  });
});

describe('getApiErrorMessage', () => {
  it('skips 401s', () => {
    expect(getApiErrorMessage(axiosError(401))).toBeNull();
  });

  it('prefers the limit message over the API detail', () => {
    const error = axiosError(
      429,
      { code: 'RATE_LIMITED', detail: 'Rate limit exceeded' },
      {
        'retry-after': '3',
      },
    );
    expect(getApiErrorMessage(error)).toBe('Too many requests — try again in 3 s');
  });

  it('keeps the existing detail / validation / status fallbacks', () => {
    expect(getApiErrorMessage(axiosError(404, { detail: 'Model not found' }))).toBe(
      'Model not found',
    );
    expect(
      getApiErrorMessage(axiosError(422, { detail: [{ msg: 'field required' }, { msg: 'bad' }] })),
    ).toBe('field required, bad');
    expect(getApiErrorMessage(axiosError(500))).toBe('Server error — please try again later');
    expect(getApiErrorMessage(axiosError(409))).toBe('Request failed (409)');
    expect(getApiErrorMessage(new AxiosError('Network Error'))).toBe(
      'Network error — please check your connection',
    );
    expect(getApiErrorMessage(new Error('boom'))).toBe('boom');
    expect(getApiErrorMessage(42)).toBe('An unexpected error occurred');
  });
});

describe('getUploadErrorMessage', () => {
  it('uses the limit message when available, else the fallback', () => {
    expect(getUploadErrorMessage(axiosError(413), 'Upload failed')).toBe('File/request too large');
    expect(getUploadErrorMessage(axiosError(500), 'Upload failed')).toBe('Upload failed');
  });
});

describe('retry policy', () => {
  it('never retries auth, rate-limit, size or storage errors', () => {
    for (const status of [401, 413, 429, 507]) {
      expect(isNonRetryableError(axiosError(status))).toBe(true);
      expect(shouldRetryQuery(0, axiosError(status))).toBe(false);
    }
    expect(isNonRetryableError(new Error(JSON.stringify({ code: 'RATE_LIMITED' })))).toBe(true);
  });

  it('retries other errors once', () => {
    expect(shouldRetryQuery(0, axiosError(500))).toBe(true);
    expect(shouldRetryQuery(1, axiosError(500))).toBe(false);
    expect(shouldRetryQuery(0, new Error('network'))).toBe(true);
  });
});
