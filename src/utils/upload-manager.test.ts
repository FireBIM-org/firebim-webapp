import { IfcParser } from '@ifc-lite/parser';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import apiClient from './api-client';
import { extractAndTransform } from './ifc-transformer';
import { handleIfcUpload } from './upload-manager';

vi.mock('@ifc-lite/parser', () => {
  return {
    IfcParser: vi.fn(function () {
      return {
        parseColumnar: vi.fn().mockResolvedValue({}),
      };
    }),
  };
});

vi.mock('./api-client', () => ({
  default: {
    uploadModel: vi.fn(),
    uploadModelData: vi.fn(),
    deriveLexiconProfile: vi.fn(),
    getProfile: vi.fn(),
  },
}));

vi.mock('./ifc-transformer', () => ({
  extractAndTransform: vi.fn(),
}));

describe('handleIfcUpload', () => {
  const mockFile = {
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    name: 'test.ifc',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFile.arrayBuffer.mockResolvedValue(new ArrayBuffer(8));
  });

  it('should complete the full upload flow', async () => {
    const onProgress = vi.fn();
    const onSuccess = vi.fn();

    vi.mocked(apiClient.getProfile).mockResolvedValue({
      profile_record: {
        profile: { target_classes: [], property_paths: [], relation_paths: [] },
      },
    } as any);
    vi.mocked(apiClient.uploadModel).mockResolvedValue({ id: 'model-123' } as any);
    vi.mocked(apiClient.uploadModelData).mockResolvedValue({ message: 'ok' });
    vi.mocked(extractAndTransform).mockReturnValue({
      entities: [],
      properties: [],
      quantities: [],
    });

    await handleIfcUpload(mockFile, { onProgress, onSuccess, profileId: 'profile-123' });

    expect(mockFile.arrayBuffer).toHaveBeenCalled();
    expect(apiClient.getProfile).toHaveBeenCalledWith('profile-123');
    expect(apiClient.uploadModel).toHaveBeenCalledWith(mockFile);
    expect(extractAndTransform).toHaveBeenCalled();
    expect(apiClient.uploadModelData).toHaveBeenCalledWith('model-123', expect.anything());
    expect(onSuccess).toHaveBeenCalled();
    // We expect several progress updates
    expect(onProgress).toHaveBeenCalledWith(expect.any(Number));
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('should call onError when parsing fails', async () => {
    const onError = vi.fn();
    mockFile.arrayBuffer.mockRejectedValue(new Error('Read error'));

    await handleIfcUpload(mockFile, { onError });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should report progress correctly', async () => {
    const onProgress = vi.fn();

    let progressCallback: any;
    vi.mocked(IfcParser).mockImplementation(function () {
      return {
        parseColumnar: vi.fn().mockImplementation((_buffer, options) => {
          progressCallback = options.onProgress;
          return Promise.resolve({});
        }),
      };
    });

    vi.mocked(apiClient.getProfile).mockResolvedValue({
      profile_record: {
        profile: { target_classes: [], property_paths: [], relation_paths: [] },
      },
    } as any);
    vi.mocked(apiClient.uploadModel).mockResolvedValue({ id: 'model-1' } as any);
    vi.mocked(apiClient.uploadModelData).mockResolvedValue({ message: 'ok' });
    vi.mocked(extractAndTransform).mockReturnValue({
      entities: [],
      properties: [],
      quantities: [],
    });

    const uploadPromise = handleIfcUpload(mockFile, { onProgress, profileId: 'profile-1' });

    // Wait a bit for the first progress call (10)
    await new Promise((r) => setTimeout(r, 0));
    expect(onProgress).toHaveBeenCalledWith(10);

    // Trigger parsing progress
    if (progressCallback) {
      progressCallback({ percent: 50 });
    }

    expect(onProgress).toHaveBeenCalledWith(40); // 20 + 50 * 0.4

    await uploadPromise;
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it('should bypass filtering when profileId is full-hierarchy', async () => {
    const onSuccess = vi.fn();
    vi.mocked(apiClient.uploadModel).mockResolvedValue({ id: 'model-full' } as any);
    vi.mocked(apiClient.uploadModelData).mockResolvedValue({ message: 'ok' });
    vi.mocked(extractAndTransform).mockReturnValue({
      entities: [],
      properties: [],
      quantities: [],
    });

    await handleIfcUpload(mockFile, { onSuccess, profileId: 'full-hierarchy' });

    expect(apiClient.getProfile).not.toHaveBeenCalled();
    expect(extractAndTransform).toHaveBeenCalledWith(expect.anything(), undefined);
    expect(onSuccess).toHaveBeenCalled();
  });
});
