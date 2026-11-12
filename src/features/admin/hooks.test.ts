import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { isNotFound, retryUnlessNotFound } from './hooks';

function apiError(status: number): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response = { status, data: {}, config, headers: {} } as AxiosResponse;
  return new AxiosError(`status ${status}`, String(status), config, null, response);
}

describe('isNotFound', () => {
  it('matches only an API 404', () => {
    expect(isNotFound(apiError(404))).toBe(true);
    expect(isNotFound(apiError(500))).toBe(false);
    expect(isNotFound(new Error('404'))).toBe(false);
  });
});

describe('retryUnlessNotFound', () => {
  it('does not retry a 404 or a 401', () => {
    expect(retryUnlessNotFound(0, apiError(404))).toBe(false);
    expect(retryUnlessNotFound(0, apiError(401))).toBe(false);
  });

  it('retries other errors once', () => {
    expect(retryUnlessNotFound(0, apiError(500))).toBe(true);
    expect(retryUnlessNotFound(1, apiError(500))).toBe(false);
    expect(retryUnlessNotFound(0, new Error('network'))).toBe(true);
  });
});
