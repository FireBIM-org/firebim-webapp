import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

import apiClient, { type IngestionJob } from '@/utils/api-client';
import { createRequestId } from '@/utils/request-id';
import { handleIfcUpload } from '@/utils/upload-manager';

import { RevisionAvailability, RevisionSelect, useIngestionRevisions } from './RevisionSelect';
import { ingestionError } from './status';

export function NeoUpload({ userId }: { userId: string }) {
  const router = useRouter();
  const revisions = useIngestionRevisions(userId);
  const [revisionId, setRevisionId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState('');
  const [bytes, setBytes] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const intent = useRef<string | null>(null);
  const storageKey = `neo-pending-upload:${userId}`;

  useEffect(() => {
    try {
      setPendingUpload(localStorage.getItem(storageKey));
    } catch {
      /* Storage can be unavailable. */
    }
    return () => controller.current?.abort();
  }, [storageKey]);

  const admitted = (job: IngestionJob) => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Server remains authoritative. */
    }
    setPendingUpload(null);
    void router.push(`/ifc-models/${encodeURIComponent(job.model_id)}`);
  };

  const upload = async () => {
    const revision = revisions.data?.revisions.find((item) => item.revision_id === revisionId);
    if (!file || !revision || busy) return;
    setBusy(true);
    setError(null);
    setBytes({ loaded: 0, total: file.size });
    const abort = new AbortController();
    controller.current = abort;
    try {
      intent.current ??= createRequestId();
      const job = await handleIfcUpload(file, {
        backend: 'neo',
        profileId: revision.profile_id,
        revisionId,
        maxInputBytes: revisions.data?.max_input_bytes,
        requestId: intent.current,
        signal: abort.signal,
        onStage: setStage,
        onBytesProgress: (loaded, total) => setBytes({ loaded, total }),
        onSession: (session) => {
          setPendingUpload(session.id);
          try {
            localStorage.setItem(storageKey, session.id);
          } catch {
            /* No signed URL or evidence is stored in the browser. */
          }
        },
        onError: (failure) => {
          if (!abort.signal.aborted) setError(ingestionError(failure));
        },
      });
      if (job) admitted(job);
    } catch (failure) {
      if (!abort.signal.aborted) setError(ingestionError(failure));
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const recover = async () => {
    if (!pendingUpload || busy) return;
    setBusy(true);
    setError(null);
    controller.current = new AbortController();
    try {
      const session = await apiClient.getIfcUpload(pendingUpload, controller.current.signal);
      const job = session.job_id
        ? await apiClient.getIngestionJob(session.job_id, controller.current.signal)
        : await apiClient.completeIfcUpload(session.id, controller.current.signal);
      admitted(job);
    } catch (failure) {
      setError(ingestionError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5 rounded-md bg-white p-6 shadow" aria-label="Raw IFC4 upload">
      <p className="text-sm text-gray-600">
        Transfer the original IFC4 file privately, without browser IFC extraction. Processing
        continues on the server after upload; a ready graph is published only after validation.
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
            onChange={(value) => {
              setRevisionId(value);
              intent.current = null;
            }}
            disabled={busy}
          />
          <p className="text-sm text-gray-600">
            Configured input ceiling: {revisions.data.max_input_bytes.toLocaleString()} bytes. This
            is not a general capacity guarantee.
          </p>
          <div>
            <label htmlFor="raw-ifc" className="block text-sm font-medium text-gray-700">
              IFC4 file
            </label>
            <input
              id="raw-ifc"
              type="file"
              accept=".ifc"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                intent.current = null;
                setError(null);
              }}
              className="mt-2 block w-full text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void upload()}
            disabled={busy || !file || !revisionId || file.size > revisions.data.max_input_bytes}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Upload raw IFC4
          </button>
          {file && file.size > revisions.data.max_input_bytes && (
            <p role="alert">This file exceeds the configured input ceiling.</p>
          )}
        </>
      )}
      {busy && (
        <div role="status" aria-live="polite">
          <p>
            {stage === 'hashing'
              ? 'Hashing input (not parsing IFC)…'
              : stage === 'admitting'
                ? 'Verifying upload and admitting processing…'
                : stage === 'transferring'
                  ? 'Transferring raw bytes…'
                  : 'Recovering upload…'}
          </p>
          {stage === 'transferring' && (
            <>
              <progress
                aria-label="Bytes transferred"
                max={bytes.total || 1}
                value={bytes.loaded}
                className="w-full"
              />
              <p>
                {bytes.loaded.toLocaleString()} / {bytes.total.toLocaleString()} bytes
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => controller.current?.abort()}
            className="mt-2 underline"
          >
            Stop waiting / cancel transfer
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {pendingUpload && (
        <div className="text-sm text-gray-700">
          <p>
            An upload session was retained. If transfer finished, recover its job; server-side
            size/hash/schema verification still applies. An interrupted transfer needs the original
            file again.
          </p>
          <button
            type="button"
            onClick={() => void recover()}
            disabled={busy}
            className="mt-2 text-orange-700 underline"
          >
            Recover uploaded job
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              try {
                localStorage.removeItem(storageKey);
              } catch {
                /* Local recovery only. */
              }
              setPendingUpload(null);
              intent.current = null;
              setError(null);
            }}
            className="mt-2 ml-4 underline"
          >
            Forget local recovery
          </button>
        </div>
      )}
    </section>
  );
}
