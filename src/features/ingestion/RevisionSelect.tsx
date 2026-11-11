import { useQuery } from '@tanstack/react-query';

import apiClient, { type IngestionRevision } from '@/utils/api-client';

import { ingestionError } from './status';

export function useIngestionRevisions(userId: string) {
  return useQuery({
    queryKey: ['ingestion-revisions', userId],
    queryFn: ({ signal }) => apiClient.getIngestionRevisions(signal),
    enabled: !!userId,
    retry: false,
  });
}

export function RevisionSelect({
  revisions,
  value,
  onChange,
  disabled = false,
}: {
  revisions: IngestionRevision[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor="ingestion-revision" className="block text-sm font-medium text-gray-700">
        Published translation revision
      </label>
      <select
        id="ingestion-revision"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500 disabled:opacity-60"
      >
        <option value="">Select a supported published revision</option>
        {revisions.map((revision) => (
          <option key={revision.revision_id} value={revision.revision_id}>
            {revision.profile_name} — {revision.revision_id}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-gray-500">
        Only authorized, runtime-supported published revisions are offered. Drafts and rule-derived
        profiles are not executable here.
      </p>
    </div>
  );
}

export function RevisionAvailability({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  onRetry: () => void;
}) {
  if (loading) return <p role="status">Loading supported revisions…</p>;
  if (error)
    return (
      <div role="alert" className="text-sm text-gray-700">
        <p>Translation ingestion is unavailable: {ingestionError(error)}</p>
        <p>
          General admission stays disabled until resource qualification, licensing, storage and
          retention/sharing gates are cleared. Legacy ingestion is separate.
        </p>
        <button type="button" onClick={onRetry} className="mt-2 text-orange-700 underline">
          Refresh availability
        </button>
      </div>
    );
  if (empty)
    return <p role="status">No supported published revisions are available to your account.</p>;
  return null;
}
