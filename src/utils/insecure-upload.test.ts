import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import apiClient from './api-client';
import { handleIfcUpload } from './upload-manager';

vi.mock('./api-client', () => ({
  default: {
    initiateIfcUpload: vi.fn().mockResolvedValue({ id: 'upload', status: 'completed' }),
    completeIfcUpload: vi.fn().mockResolvedValue({ id: 'job' }),
  },
}));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());

it('uploads over HTTP without crypto.subtle using the correct SHA-256', async () => {
  vi.stubGlobal('crypto', undefined);
  const onError = vi.fn();
  const result = await handleIfcUpload(
    {
      name: 'wall.ifc',
      size: 3,
      arrayBuffer: async () => new TextEncoder().encode('abc').buffer,
    } as File,
    {
      backend: 'neo',
      profileId: 'p',
      revisionId: 'r',
      maxInputBytes: 3,
      requestId: 'intent',
      onError,
    },
  );
  expect(onError).not.toHaveBeenCalled();
  expect(apiClient.initiateIfcUpload).toHaveBeenCalledWith(
    expect.objectContaining({
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    }),
    undefined,
  );
  expect(result).toEqual({ id: 'job' });
});

it.each([1, 55, 56, 64, 65, 1024])('hashes %i binary bytes without Web Crypto', async (size) => {
  vi.stubGlobal('crypto', undefined);
  const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
  const onError = vi.fn();
  await handleIfcUpload(
    {
      name: 'binary.ifc',
      size,
      arrayBuffer: async () => bytes.buffer,
    } as File,
    {
      backend: 'neo',
      profileId: 'p',
      revisionId: 'r',
      maxInputBytes: size,
      requestId: 'intent',
      onError,
    },
  );
  expect(onError).not.toHaveBeenCalled();
  expect(apiClient.initiateIfcUpload).toHaveBeenCalledWith(
    expect.objectContaining({
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }),
    undefined,
  );
});
