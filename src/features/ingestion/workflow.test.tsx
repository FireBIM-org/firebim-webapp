import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
// @vitest-environment happy-dom
import { webcrypto } from 'node:crypto';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient, { type IFCModel, type IngestionJob } from '@/utils/api-client';

import { ModelProcessing } from './ModelProcessing';
import { NeoUpload } from './NeoUpload';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: navigate }) }));
vi.mock('@ifc-lite/parser', () => ({
  IfcParser: vi.fn(() => {
    throw Error('Unexpected browser IFC parsing');
  }),
}));

const revision = {
  profile_id: 'profile',
  profile_name: 'Walls',
  revision_id: 'revision',
  revision_digest: 'digest',
  published_at: '2026-10-27T00:00:00Z',
};

function makeJob(values: Partial<IngestionJob> = {}): IngestionJob {
  return {
    id: 'job',
    model_id: 'model',
    status: 'queued',
    stage: 'admitted',
    dispatch_generation: 1,
    attempt_count: 0,
    max_attempts: 3,
    retryable: false,
    cancellation_requested: false,
    profile_id: 'profile',
    revision_id: 'revision',
    revision_digest: 'digest',
    raw_sha256: 'hash',
    raw_size: 4179,
    source_schema: 'IFC4',
    runtime_fingerprint: 'fingerprint',
    result_graph_id: null,
    created_at: '2026-10-27T00:00:00Z',
    updated_at: '2026-10-27T00:00:00Z',
    ...values,
  } as IngestionJob;
}

function mount(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  return { ...view, client };
}

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  vi.spyOn(apiClient, 'getIngestionRevisions').mockResolvedValue({
    revisions: [revision],
    count: 1,
    max_input_bytes: 225635,
    runtime_fingerprint: 'fingerprint',
  });
  vi.spyOn(apiClient, 'getIngestionReport').mockResolvedValue({
    report_version: 'neo-ingestion/2',
    job_id: 'job',
    diagnostics: [],
    attempts: [],
  });
  vi.spyOn(apiClient, 'getModelJobs').mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  navigate.mockReset();
});

describe('raw upload to durable readiness', () => {
  it('shows actual transferred bytes, retains recovery and navigates to processing rather than Rulebook', async () => {
    vi.spyOn(apiClient, 'initiateIfcUpload').mockResolvedValue({
      id: 'upload',
      model_id: 'model',
      status: 'uploading',
      upload_url: 'https://private.example/signed',
    } as any);
    let finish!: () => void;
    vi.spyOn(apiClient, 'transferIfcUpload').mockImplementation(
      async (_file, _session, progress) => {
        progress?.(2, 3);
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    );
    vi.spyOn(apiClient, 'completeIfcUpload').mockResolvedValue(makeJob());
    const sql = vi.spyOn(apiClient, 'uploadModelData');
    mount(<NeoUpload userId="owner" />);
    fireEvent.change(await screen.findByLabelText('Published translation revision'), {
      target: { value: 'revision' },
    });
    const file = new File(['abc'], 'wall.ifc');
    vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new TextEncoder().encode('abc').buffer);
    fireEvent.change(screen.getByLabelText('IFC4 file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload raw IFC4' }));
    await screen.findByText('2 / 3 bytes');
    expect(localStorage.getItem('neo-pending-upload:owner')).toBe('upload');
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/ifc-models/model'));
    expect(localStorage.getItem('neo-pending-upload:owner')).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it('recovers a completed upload after reload without storing signed URLs or re-uploading', async () => {
    localStorage.setItem('neo-pending-upload:owner', 'upload');
    vi.spyOn(apiClient, 'getIfcUpload').mockResolvedValue({
      id: 'upload',
      model_id: 'model',
      status: 'completed',
      job_id: 'job',
    } as any);
    vi.spyOn(apiClient, 'getIngestionJob').mockResolvedValue(makeJob());
    const transfer = vi.spyOn(apiClient, 'transferIfcUpload');
    mount(<NeoUpload userId="owner" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recover uploaded job' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/ifc-models/model'));
    expect(transfer).not.toHaveBeenCalled();
  });

  it('restores processing after reload, opens only ready IDs and preserves the previous result during reprocessing failure', async () => {
    let job = makeJob({ status: 'running', stage: 'mapping', attempt_count: 1 });
    let model = {
      id: 'model',
      filename: 'wall.ifc',
      user_id: 'owner',
      created_at: job.created_at,
      ingestion_backend: 'neo',
      latest_job_id: 'job',
      latest_successful_graph_id: null,
    } as IFCModel;
    vi.spyOn(apiClient, 'getIngestionJob').mockImplementation(async () => ({ ...job }));
    vi.spyOn(apiClient, 'getModel').mockImplementation(async () => ({ ...model }));
    function Detail() {
      const query = useQuery({
        queryKey: ['model', 'owner', 'model'],
        queryFn: () => apiClient.getModel('model'),
      });
      return query.data ? <ModelProcessing model={query.data} userId="owner" /> : null;
    }
    const first = mount(<Detail />);
    await screen.findByText(/Stage: mapping/);
    expect(screen.queryByRole('link', { name: /Open.*Rulebook/ })).toBeNull();
    first.unmount();
    first.client.clear();
    const second = mount(<Detail />);
    await screen.findByText(/Stage: mapping/);
    job = {
      ...job,
      status: 'succeeded',
      stage: 'completed',
      result_graph_id: 'neo_first',
      updated_at: '2026-10-27T00:01:00Z',
    };
    model = { ...model, latest_successful_graph_id: 'neo_first' };
    await act(async () => {
      await second.client.invalidateQueries();
    });
    expect(
      (await screen.findByRole('link', { name: 'Open ready graph in Rulebook' })).getAttribute(
        'href',
      ),
    ).toBe('/rulebook?graph_id=neo_first');
    vi.spyOn(apiClient, 'reprocessModel').mockImplementation(async () => {
      job = makeJob({ id: 'new-job', status: 'running', stage: 'conversion' });
      model = { ...model, latest_job_id: 'new-job' };
      return job;
    });
    fireEvent.change(screen.getByLabelText('Published translation revision'), {
      target: { value: 'revision' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reprocess retained IFC4' }));
    await screen.findByText(/Stage: conversion/);
    expect(
      screen
        .getByRole('link', { name: 'Open previous ready graph in Rulebook' })
        .getAttribute('href'),
    ).toBe('/rulebook?graph_id=neo_first');
    job = {
      ...job,
      status: 'failed',
      stage: 'validation',
      retryable: false,
      updated_at: '2026-10-27T00:02:00Z',
    };
    await act(async () => {
      await second.client.invalidateQueries();
    });
    await screen.findByText('Processing failed. No partial result was published.');
    expect(screen.queryByRole('button', { name: 'Retry transient failure' })).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Open previous ready graph in Rulebook' })
        .getAttribute('href'),
    ).toBe('/rulebook?graph_id=neo_first');
  });

  it('permits only a fenced transient retry and renders durable diagnostics', async () => {
    const job = makeJob({ status: 'failed', retryable: true, dispatch_generation: 4 });
    vi.spyOn(apiClient, 'getIngestionJob').mockResolvedValue(job);
    vi.mocked(apiClient.getIngestionReport).mockResolvedValue({
      report_version: 'neo-ingestion/2',
      job_id: 'job',
      diagnostics: [{ code: 'storage_unavailable', message: 'Private storage is unavailable' }],
      attempts: [],
    });
    const retry = vi
      .spyOn(apiClient, 'retryIngestionJob')
      .mockResolvedValue({ ...job, status: 'queued', dispatch_generation: 5 });
    mount(
      <ModelProcessing model={{ id: 'model', latest_job_id: 'job' } as IFCModel} userId="owner" />,
    );
    const button = await screen.findByRole('button', { name: 'Retry transient failure' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith('job', {
        request_id: expect.any(String),
        expected_dispatch_generation: 4,
      }),
    );
    expect(screen.getByText(/Private storage is unavailable/)).toBeTruthy();
  });

  it('keeps same-snapshot retry available when revision discovery fails', async () => {
    const job = makeJob({ status: 'failed', retryable: true, dispatch_generation: 2 });
    vi.spyOn(apiClient, 'getIngestionJob').mockResolvedValue(job);
    vi.mocked(apiClient.getIngestionRevisions).mockRejectedValue(new Error('discovery down'));
    const retry = vi
      .spyOn(apiClient, 'retryIngestionJob')
      .mockResolvedValue({ ...job, status: 'queued', dispatch_generation: 3 });
    mount(
      <ModelProcessing model={{ id: 'model', latest_job_id: 'job' } as IFCModel} userId="owner" />,
    );
    const button = await screen.findByRole('button', { name: 'Retry transient failure' });
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith('job', {
        request_id: expect.any(String),
        expected_dispatch_generation: 2,
      }),
    );
    expect(screen.queryByRole('button', { name: 'Reprocess retained IFC4' })).toBeNull();
  });
});
