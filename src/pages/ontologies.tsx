import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';

import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import PrimaryButton from '../components/PrimaryButton';
import { useRequireAuth } from '../hooks/useRequireAuth';
import apiClient, {
  type OntologySyncItem,
  type OntologySyncRequest,
  type OntologySyncResponse,
} from '../utils/api-client';

const ACTION_STYLES: Record<string, string> = {
  publish: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  current: 'bg-gray-100 text-gray-700',
  skip: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-800 ring-amber-200',
  candidate: 'bg-blue-50 text-blue-800 ring-blue-200',
  stable: 'bg-green-50 text-green-800 ring-green-200',
  deprecated: 'bg-gray-100 text-gray-700 ring-gray-200',
  withdrawn: 'bg-red-50 text-red-800 ring-red-200',
};

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium tracking-wide uppercase ${className}`}
    >
      {text}
    </span>
  );
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { response?: { data?: { detail?: unknown } }; message?: string };
    const detail = maybe.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (maybe.message) return maybe.message;
  }
  return 'Unexpected error';
}

interface OntologyGroup {
  key: string;
  family: string;
  country: string;
  title: string | null;
  kind: string;
  visibility: string;
  items: OntologySyncItem[];
}

function groupItems(items: OntologySyncItem[]): OntologyGroup[] {
  const groups = new Map<string, OntologyGroup>();
  for (const item of items) {
    const key = `${item.ontology_family}/${item.country}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        family: item.ontology_family,
        country: item.country,
        title: item.title ?? null,
        kind: item.kind ?? 'ontology',
        visibility: item.visibility ?? 'public',
        items: [],
      });
    }
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}

export default function OntologiesPage() {
  const { user, isLoading: authLoading } = useRequireAuth();

  const sourceQuery = useQuery({
    queryKey: ['ontology-sync-source'],
    queryFn: () => apiClient.getOntologySyncSource(),
    enabled: !!user,
  });

  const [sourceUrl, setSourceUrl] = useState('');
  const [includeUnlisted, setIncludeUnlisted] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<OntologySyncResponse | null>(null);
  const [result, setResult] = useState<OntologySyncResponse | null>(null);

  useEffect(() => {
    if (sourceQuery.data && !sourceUrl) setSourceUrl(sourceQuery.data.default_source_url);
  }, [sourceQuery.data, sourceUrl]);

  const baseRequest = (): OntologySyncRequest => ({
    source_url: sourceUrl || null,
    include_unlisted: includeUnlisted,
    overwrite,
    latest_only: false,
    dry_run: false,
  });

  const previewMutation = useMutation({
    mutationFn: () => apiClient.previewOntologySync(baseRequest()),
    onSuccess: (data) => {
      setPreview(data);
      setResult(null);
      setSelected(
        new Set(
          (data.items ?? [])
            .filter((item) => item.action === 'publish' || item.action === 'update')
            .map((item) => item.id),
        ),
      );
    },
  });

  const syncMutation = useMutation({
    mutationFn: (selections: string[] | null) =>
      apiClient.runOntologySync({
        ...baseRequest(),
        selections,
      }),
    onSuccess: (data) => {
      setResult(data);
      // refresh the plan so local state reflects what was just published
      previewMutation.mutate();
    },
  });

  const groups = useMemo(() => groupItems(preview?.items ?? []), [preview]);
  const actionable = useMemo(
    () =>
      (preview?.items ?? []).filter(
        (item) => item.action === 'publish' || item.action === 'update',
      ),
    [preview],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  const busy = previewMutation.isPending || syncMutation.isPending;

  return (
    <Layout title="Ontologies | FireBIM">
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Ontologies</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-700">
          Keep this API&apos;s ontology store in sync with the public FireBIM registry. The registry
          on{' '}
          <a
            href="https://firebim.org/documentation/ontologies/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-600 hover:text-orange-500"
          >
            firebim.org
          </a>{' '}
          publishes every FBO release (core, national modules and the FBO → IFC mapping) as
          versioned Turtle files with a JSON index — no credentials needed. Syncing publishes the
          versions that are missing here; nothing is ever deleted and existing versions are only
          replaced if you ask for it.
        </p>
      </div>

      {/* Source + options */}
      <div className="rounded-lg bg-white p-4 shadow">
        <label htmlFor="source-url" className="block text-sm font-medium text-gray-700">
          Registry index URL
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            id="source-url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder={sourceQuery.data?.default_source_url ?? 'https://…/index.json'}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500"
          />
          <PrimaryButton
            onClick={() => previewMutation.mutate()}
            disabled={busy || !sourceUrl}
            className="justify-center whitespace-nowrap"
          >
            <ArrowPathIcon
              className={`mr-2 h-4 w-4 ${previewMutation.isPending ? 'animate-spin' : ''}`}
            />
            Check registry
          </PrimaryButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeUnlisted}
              onChange={(e) => setIncludeUnlisted(e.target.checked)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Include unlisted reference ontologies (IFC, RIR)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            Replace local versions whose content or status differs
          </label>
          {sourceQuery.data && sourceUrl !== sourceQuery.data.default_source_url && (
            <button
              type="button"
              className="text-orange-600 hover:text-orange-500"
              onClick={() => setSourceUrl(sourceQuery.data!.default_source_url)}
            >
              Reset to default registry
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Any site that serves an index in the same format can be used as a source — see the
          developer section on the firebim.org ontologies page.
        </p>
      </div>

      {previewMutation.isError && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>Could not read the registry: {errorMessage(previewMutation.error)}</span>
        </div>
      )}
      {syncMutation.isError && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>Sync failed: {errorMessage(syncMutation.error)}</span>
        </div>
      )}

      {result && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-md border p-3 text-sm ${
            result.failed > 0
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-green-200 bg-green-50 text-green-900'
          }`}
        >
          <CheckCircleIcon className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">
              Sync finished: {result.published} published, {result.failed} failed, {result.skipped}{' '}
              skipped, {result.current} already current.
            </p>
            {(result.items ?? [])
              .filter((item) => item.action === 'failed')
              .map((item) => (
                <p key={item.id} className="mt-1 font-mono text-xs">
                  {item.id}: {item.error}
                </p>
              ))}
          </div>
        </div>
      )}

      {/* Plan */}
      {preview && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              <span className="font-medium">{preview.registry ?? 'Registry'}</span> ·{' '}
              {preview.total} versions ·{' '}
              <span className="text-green-700">{preview.to_publish} new</span> ·{' '}
              <span className="text-blue-700">{preview.to_update} changed</span> ·{' '}
              <span className="text-gray-600">{preview.current} current</span> ·{' '}
              <span className="text-amber-700">{preview.skipped} skipped</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => syncMutation.mutate([...selected])}
                className="inline-flex items-center rounded-md border border-orange-600 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50"
              >
                Sync selected ({selected.size})
              </button>
              <PrimaryButton
                disabled={busy || actionable.length === 0}
                onClick={() => syncMutation.mutate(null)}
              >
                {syncMutation.isPending ? (
                  <>
                    <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" /> Syncing…
                  </>
                ) : (
                  `Sync all new (${actionable.length})`
                )}
              </PrimaryButton>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {groups.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-lg bg-white shadow">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <div>
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {group.key}
                    </span>
                    {group.title && (
                      <span className="ml-2 text-sm text-gray-600">{group.title}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {group.kind === 'mapping' && (
                      <Badge text="mapping" className="bg-purple-100 text-purple-800" />
                    )}
                    {group.visibility !== 'public' && (
                      <Badge text="unlisted" className="bg-gray-200 text-gray-700" />
                    )}
                  </div>
                </div>
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                      <th className="w-8 px-4 py-2"></th>
                      <th className="px-4 py-2">Version</th>
                      <th className="px-4 py-2">Registry status</th>
                      <th className="px-4 py-2">Issued</th>
                      <th className="px-4 py-2">Local</th>
                      <th className="px-4 py-2">Action</th>
                      <th className="px-4 py-2">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.items.map((item) => {
                      const selectable = item.action === 'publish' || item.action === 'update';
                      return (
                        <tr key={item.id} className={selectable ? '' : 'text-gray-500'}>
                          <td className="px-4 py-2">
                            {selectable && (
                              <input
                                type="checkbox"
                                checked={selected.has(item.id)}
                                onChange={() => toggle(item.id)}
                                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                              />
                            )}
                          </td>
                          <td className="px-4 py-2 font-mono">
                            {item.version}
                            {item.is_latest && (
                              <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">
                                LATEST
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[item.status] ?? ''}`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">{item.issued_at}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {item.local_exists ? (
                              <span>
                                present{item.local_status ? ` · ${item.local_status}` : ''}
                              </span>
                            ) : (
                              <span className="text-gray-400">missing</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <Badge
                              text={item.published ? 'synced' : item.action}
                              className={
                                item.published
                                  ? ACTION_STYLES.publish
                                  : (ACTION_STYLES[item.action] ?? ACTION_STYLES.current)
                              }
                            />
                          </td>
                          <td className="max-w-md px-4 py-2 text-xs text-gray-600">
                            {item.error ?? item.reason}
                            {' · '}
                            <a
                              href={item.ttl_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-600 hover:text-orange-500"
                            >
                              ttl
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {!preview && !previewMutation.isPending && (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Press <span className="font-medium text-gray-700">Check registry</span> to compare the
          public releases with the ontologies available in this API. Versions are listed newest
          first.
        </div>
      )}
    </Layout>
  );
}
