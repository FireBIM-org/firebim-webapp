import { afterEach, expect, it, vi } from 'vitest';

import { createRequestId } from './request-id';

afterEach(() => vi.unstubAllGlobals());

it('prefers native randomUUID', () => {
  const randomUUID = vi.fn(() => 'native-uuid');
  vi.stubGlobal('crypto', { randomUUID });
  expect(createRequestId()).toBe('native-uuid');
  expect(randomUUID).toHaveBeenCalledOnce();
});

it('creates a UUID v4 with secure random bytes when randomUUID is unavailable', () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(255));
  vi.stubGlobal('crypto', { getRandomValues });
  expect(createRequestId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  expect(getRandomValues).toHaveBeenCalledOnce();
});

it('reports unavailable secure randomness without an insecure fallback', () => {
  vi.stubGlobal('crypto', undefined);
  expect(createRequestId).toThrow(/Use HTTPS or localhost/);
});
