import { afterEach, describe, expect, it, vi } from 'vitest';

import apiClient, { type IfcUploadSession } from './api-client';

afterEach(() => vi.unstubAllGlobals());

describe('signed raw byte transfer', () => {
  it('sends exactly the File with only octet-stream and no proxy credentials', async () => {
    const xhr = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      upload: {} as any,
      status: 200,
      withCredentials: true,
      timeout: 0,
      send: vi.fn(),
      onload: () => undefined,
    };
    vi.stubGlobal('XMLHttpRequest', function () {
      return xhr;
    });
    const progress = vi.fn();
    const file = { size: 4179 } as File;
    const transfer = apiClient.transferIfcUpload(
      file,
      { upload_url: 'https://private.example/signed' } as IfcUploadSession,
      progress,
    );
    expect(xhr.open).toHaveBeenCalledWith('PUT', 'https://private.example/signed');
    expect(xhr.setRequestHeader.mock.calls).toEqual([['Content-Type', 'application/octet-stream']]);
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.send).toHaveBeenCalledWith(file);
    xhr.upload.onprogress({ loaded: 2048 });
    expect(progress).toHaveBeenCalledWith(2048, 4179);
    xhr.onload();
    await transfer;
  });
});
