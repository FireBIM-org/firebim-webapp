import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient from './api-client';
import { handleIfcUpload } from './upload-manager';

vi.mock('./api-client', () => ({
  default: {
    initiateIfcUpload: vi.fn(),
    transferIfcUpload: vi.fn(),
    completeIfcUpload: vi.fn(),
    uploadModel: vi.fn(),
    uploadModelData: vi.fn(),
  },
}));
vi.mock('@ifc-lite/parser', () => ({
  IfcParser: vi.fn(() => {
    throw Error('Neo must not parse IFC');
  }),
}));

describe('revision-bound raw upload', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', webcrypto);
  });

  it('hashes raw bytes, transfers directly and returns an admitted job, not a ready graph', async () => {
    const file = {
      name: 'wall.ifc',
      size: 3,
      arrayBuffer: async () => new TextEncoder().encode('abc').buffer,
    } as File;
    const session = {
      id: 'upload',
      model_id: 'model',
      status: 'uploading',
      upload_url: 'https://private.example/signed',
    };
    const job = { id: 'job', model_id: 'model', status: 'queued', result_graph_id: null };
    vi.mocked(apiClient.initiateIfcUpload).mockResolvedValue(session as any);
    vi.mocked(apiClient.transferIfcUpload).mockImplementation(
      async (_file, _session, onProgress) => {
        onProgress?.(2, 3);
      },
    );
    vi.mocked(apiClient.completeIfcUpload).mockResolvedValue(job as any);
    const progress = vi.fn();
    const onSession = vi.fn();
    const result = await handleIfcUpload(file, {
      backend: 'neo',
      profileId: 'profile',
      revisionId: 'revision',
      maxInputBytes: 3,
      requestId: 'intent',
      onBytesProgress: progress,
      onSession,
    });
    expect(apiClient.initiateIfcUpload).toHaveBeenCalledWith(
      {
        filename: 'wall.ifc',
        size_bytes: 3,
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        request_id: 'intent',
        profile_id: 'profile',
        revision_id: 'revision',
      },
      undefined,
    );
    expect(onSession).toHaveBeenCalledWith(session);
    expect(progress).toHaveBeenCalledWith(2, 3);
    expect(apiClient.completeIfcUpload).toHaveBeenCalledWith('upload', undefined);
    expect(apiClient.uploadModel).not.toHaveBeenCalled();
    expect(apiClient.uploadModelData).not.toHaveBeenCalled();
    expect(result).toEqual(job);
  });

  it('enforces the server input limit before reading bytes', async () => {
    const file = { name: 'wall.ifc', size: 4, arrayBuffer: vi.fn() } as unknown as File;
    const onError = vi.fn();
    await handleIfcUpload(file, {
      backend: 'neo',
      profileId: 'p',
      revisionId: 'r',
      maxInputBytes: 3,
      onError,
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(apiClient.initiateIfcUpload).not.toHaveBeenCalled();
  });

  it('uploads with SHA-256 when crypto exists without subtle', async () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const file = {
      name: 'wall.ifc',
      size: 3,
      arrayBuffer: async () => new TextEncoder().encode('abc').buffer,
    } as File;
    vi.mocked(apiClient.initiateIfcUpload).mockResolvedValue({
      id: 'upload',
      status: 'completed',
    } as any);
    const onError = vi.fn();
    await handleIfcUpload(file, {
      backend: 'neo',
      profileId: 'profile',
      revisionId: 'revision',
      maxInputBytes: 3,
      onError,
    });
    expect(onError).not.toHaveBeenCalled();
    expect(apiClient.initiateIfcUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      }),
      undefined,
    );
  });
});
