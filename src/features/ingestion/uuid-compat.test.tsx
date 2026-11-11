// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import apiClient from '@/utils/api-client';
import { handleIfcUpload } from '@/utils/upload-manager';

import { NeoUpload } from './NeoUpload';

vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/utils/upload-manager', () => ({ handleIfcUpload: vi.fn() }));

afterEach(() => {
  cleanup();
  localStorage.removeItem('neo-pending-upload:owner');
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('starts a raw upload when randomUUID is unavailable', async () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
  localStorage.removeItem('neo-pending-upload:owner');
  vi.spyOn(apiClient, 'getIngestionRevisions').mockResolvedValue({
    revisions: [
      {
        profile_id: 'profile',
        profile_name: 'Walls',
        revision_id: 'revision',
        revision_digest: 'digest',
        published_at: '2026-10-27T00:00:00Z',
      },
    ],
    count: 1,
    max_input_bytes: 100,
    runtime_fingerprint: 'fingerprint',
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <NeoUpload userId="owner" />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText('Published translation revision'), {
    target: { value: 'revision' },
  });
  fireEvent.change(screen.getByLabelText('IFC4 file'), {
    target: { files: [new File(['abc'], 'wall.ifc')] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Upload raw IFC4' }));
  await waitFor(() =>
    expect(handleIfcUpload).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        requestId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      }),
    ),
  );
});

it('shows a secure-context error and resets busy state when secure randomness is unavailable', async () => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('crypto', {});
  localStorage.removeItem('neo-pending-upload:owner');
  vi.spyOn(apiClient, 'getIngestionRevisions').mockResolvedValue({
    revisions: [
      {
        profile_id: 'profile',
        profile_name: 'Walls',
        revision_id: 'revision',
        revision_digest: 'digest',
        published_at: '2026-10-27T00:00:00Z',
      },
    ],
    count: 1,
    max_input_bytes: 100,
    runtime_fingerprint: 'fingerprint',
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <NeoUpload userId="owner" />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText('Published translation revision'), {
    target: { value: 'revision' },
  });
  fireEvent.change(screen.getByLabelText('IFC4 file'), {
    target: { files: [new File(['abc'], 'wall.ifc')] },
  });
  const uploadButton = screen.getByRole('button', { name: 'Upload raw IFC4' });
  fireEvent.click(uploadButton);

  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toMatch(/Use HTTPS or localhost/),
  );
  expect((uploadButton as HTMLButtonElement).disabled).toBe(false);
  expect(handleIfcUpload).not.toHaveBeenCalled();
});
