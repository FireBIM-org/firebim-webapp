import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';

import apiClient, { type IFCModel, type IngestionJob } from '@/utils/api-client';
import { createRequestId } from '@/utils/request-id';

import { RevisionAvailability, RevisionSelect, useIngestionRevisions } from './RevisionSelect';
import { ingestionError, isIngestionActive, rulebookHref } from './status';

export function ModelProcessing({ model, userId }: { model: IFCModel; userId: string }) {
  const queryClient = useQueryClient();
  const [revisionId, setRevisionId] = useState('');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intents = useRef(new Map<string, string>());
  const revisions = useIngestionRevisions(userId);
  const jobQuery = useQuery({
    queryKey: ['ingestion-job', userId, model.latest_job_id],
    queryFn: ({ signal }) => apiClient.getIngestionJob(model.latest_job_id!, signal),
    enabled: !!model.latest_job_id,
    refetchInterval: (query) => (isIngestionActive(query.state.data) ? 2000 : false),
    retry: false,
  });
  const job = jobQuery.data;
  const active = isIngestionActive(job);
  const report = useQuery({
    queryKey: ['ingestion-report', userId, job?.id, job?.updated_at],
    queryFn: ({ signal }) => apiClient.getIngestionReport(job!.id, signal),
    enabled: !!job,
    retry: false,
    gcTime: 0,
  });
  const history = useQuery({
    queryKey: ['ingestion-history', userId, model.id, offset, job?.updated_at],
    queryFn: ({ signal }) => apiClient.getModelJobs(model.id, offset, signal),
    retry: false,
  });

  const act = async (key: string, action: (requestId: string) => Promise<IngestionJob>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!intents.current.has(key)) intents.current.set(key, createRequestId());
      const next = await action(intents.current.get(key)!);
      queryClient.setQueryData(['ingestion-job', userId, next.id], next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['model', userId, model.id] }),
        queryClient.invalidateQueries({ queryKey: ['models'] }),
        queryClient.invalidateQueries({ queryKey: ['ingestion-history', userId, model.id] }),
      ]);
    } catch (failure) {
      setError(ingestionError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Ingestion progress" className="space-y-4 rounded-md bg-white p-6 shadow">
      <h2 className="text-lg font-medium text-gray-900">Translation processing</h2>
      <p className="text-sm text-gray-600">
        Progress is durable and resumes from the server after reload. Closing this page does not
        cancel processing.
      </p>
      {jobQuery.isPending && <p role="status">Loading processing job…</p>}
      {jobQuery.error && (
        <div role="alert">
          {ingestionError(jobQuery.error)}{' '}
          <button onClick={() => void jobQuery.refetch()} className="underline">
            Reload job
          </button>
        </div>
      )}
      {job && (
        <>
          <div role="status" aria-live="polite" className="text-sm text-gray-800">
            <p>
              Status: <strong>{job.status}</strong> · Stage: {job.stage} · Attempt{' '}
              {job.attempt_count} / {job.max_attempts}
            </p>
            <p className="break-all">
              Job: {job.id} · Revision: {job.revision_id}
            </p>
            <p className="break-all">Revision digest: {job.revision_digest}</p>
            <p>
              Input: {job.raw_size.toLocaleString()} bytes · {job.source_schema} · Updated{' '}
              {new Date(job.updated_at).toLocaleString()}
            </p>
            {job.status === 'retry_wait' && (
              <p>A transient failure is waiting for a bounded server retry.</p>
            )}
            {job.status === 'failed' && <p>Processing failed. No partial result was published.</p>}
            {job.status === 'cancelled' && (
              <p>Processing was cancelled. Earlier ready results remain available.</p>
            )}
          </div>
          {job.status === 'succeeded' && job.result_graph_id && (
            <Link
              href={rulebookHref(job.result_graph_id)}
              className="inline-block text-orange-700 underline"
            >
              Open ready graph in Rulebook
            </Link>
          )}
          {job.status === 'failed' && job.retryable && !job.cancellation_requested && (
            <button
              disabled={busy}
              onClick={() =>
                void act(`retry:${job.id}:${job.dispatch_generation}`, (request_id) =>
                  apiClient.retryIngestionJob(job.id, {
                    request_id,
                    expected_dispatch_generation: job.dispatch_generation,
                  }),
                )
              }
              className="text-orange-700 underline disabled:opacity-50"
            >
              Retry transient failure
            </button>
          )}
          {active && (
            <button
              disabled={busy}
              onClick={() =>
                void act(`cancel:${job.id}`, () => apiClient.cancelIngestionJob(job.id))
              }
              className="text-red-700 underline disabled:opacity-50"
            >
              Cancel processing
            </button>
          )}
        </>
      )}
      {model.latest_successful_graph_id &&
        model.latest_successful_graph_id !== job?.result_graph_id && (
          <div className="text-sm">
            <p>The previous successful result is preserved, independently of this attempt.</p>
            <Link
              href={rulebookHref(model.latest_successful_graph_id)}
              className="text-orange-700 underline"
            >
              Open previous ready graph in Rulebook
            </Link>
          </div>
        )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">Diagnostics and attempts</summary>
        {report.isPending && <p role="status">Loading diagnostics…</p>}
        {report.error && <p role="alert">{ingestionError(report.error)}</p>}
        {report.data && (
          <div className="text-sm">
            <p>Report: {report.data.report_version}</p>
            {report.data.diagnostics.length === 0 && <p>No diagnostics reported.</p>}
            <pre className="max-h-64 overflow-auto break-all whitespace-pre-wrap">
              {JSON.stringify(
                { diagnostics: report.data.diagnostics, attempts: report.data.attempts },
                null,
                2,
              )}
            </pre>
          </div>
        )}
      </details>
      <div className="space-y-3 border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium">Explicit reprocessing</h3>
        <p className="text-sm text-gray-600">
          Create a new job from the retained immutable input and selected revision. Existing ready
          graph IDs never change.
        </p>
        <RevisionAvailability
          loading={revisions.isPending}
          error={revisions.error}
          empty={!revisions.data?.revisions.length}
          onRetry={() => void revisions.refetch()}
        />
        {revisions.data && (
          <>
            <RevisionSelect
              revisions={revisions.data.revisions}
              value={revisionId}
              onChange={setRevisionId}
              disabled={active || busy}
            />
            <button
              disabled={busy || active || !job || !revisionId}
              onClick={() => {
                const revision = revisions.data.revisions.find(
                  (item) => item.revision_id === revisionId,
                );
                if (revision)
                  void act(`reprocess:${model.latest_job_id}:${revisionId}`, (request_id) =>
                    apiClient.reprocessModel(model.id, {
                      request_id,
                      profile_id: revision.profile_id,
                      revision_id: revision.revision_id,
                    }),
                  );
              }}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Reprocess retained IFC4
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Job and graph revision history
        </summary>
        {history.error && <p role="alert">{ingestionError(history.error)}</p>}
        <ul className="space-y-2 text-sm">
          {history.data?.map((item) => (
            <li key={item.id} className="break-all">
              {item.revision_id} · {item.status} · {new Date(item.created_at).toLocaleString()}
              {item.status === 'succeeded' && item.result_graph_id && (
                <>
                  {' '}
                  ·{' '}
                  <Link
                    href={rulebookHref(item.result_graph_id)}
                    className="text-orange-700 underline"
                  >
                    Open ready revision
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-3 text-sm">
          <button
            disabled={offset === 0 || history.isFetching}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Newer jobs
          </button>
          <button
            disabled={history.data?.length !== 50 || history.isFetching}
            onClick={() => setOffset(offset + 50)}
          >
            Older jobs
          </button>
        </div>
      </details>
    </section>
  );
}
