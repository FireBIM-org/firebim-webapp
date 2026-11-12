import Link from 'next/link';
import React, { useState } from 'react';
import { toast } from 'react-toastify';

import type { AdminStorage } from '../../features/admin/api';

import ConfirmDialog from '../../components/ConfirmDialog';
import PrimaryButton from '../../components/PrimaryButton';
import AdminLayout, {
  AdminError,
  AdminLoading,
  AdminSection,
} from '../../features/admin/components/AdminLayout';
import StorageByPrefix from '../../features/admin/components/StorageByPrefix';
import UsageMeter from '../../features/admin/components/UsageMeter';
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from '../../features/admin/format';
import { useAdminStorage, useReconcileStorage } from '../../features/admin/hooks';
import { useRequireAdmin } from '../../hooks/useRequireAdmin';

const TOP_USERS = 10;

export default function AdminStoragePage() {
  const { user } = useRequireAdmin();
  const { data, isLoading, isError, refetch } = useAdminStorage(TOP_USERS, !!user);

  if (!user) return <AdminLoading />;

  return (
    <AdminLayout
      title="Storage"
      description="Object storage usage, from the API's counters. Reconciling recounts them from the bucket."
      actions={<ReconcileButton />}
    >
      {isError && !data ? (
        <AdminError onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
      ) : (
        <StorageDetails storage={data} />
      )}
    </AdminLayout>
  );
}

function ReconcileButton() {
  const [confirming, setConfirming] = useState(false);
  const reconcile = useReconcileStorage();

  const handleConfirm = () => {
    reconcile.mutate(undefined, {
      onSuccess: (summary) => {
        toast.success(
          `Storage reconciled: ${formatBytes(summary.used_bytes)} in ${formatNumber(summary.object_count)} objects`,
        );
      },
      // Errors (e.g. RECONCILE_IN_PROGRESS) are toasted by the global MutationCache handler.
      onSettled: () => setConfirming(false),
    });
  };

  return (
    <>
      <PrimaryButton
        onClick={() => setConfirming(true)}
        disabled={reconcile.isPending}
        className="disabled:opacity-50"
      >
        {reconcile.isPending ? 'Reconciling…' : 'Reconcile now'}
      </PrimaryButton>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleConfirm}
        isLoading={reconcile.isPending}
        title="Reconcile storage now?"
        description="Lists every object in the bucket and recomputes the global, per-prefix and per-user counters. On a large bucket this can take a while; it also runs automatically every 6 hours."
        confirmLabel="Reconcile"
      />
    </>
  );
}

function StorageDetails({ storage }: { storage: AdminStorage }) {
  const share = (bytes: number) => (storage.used_bytes > 0 ? bytes / storage.used_bytes : 0);
  const prefixes = [...storage.by_prefix].sort((a, b) => b.bytes - a.bytes);

  return (
    <div className="space-y-6">
      <AdminSection title="Summary">
        <UsageMeter
          label="Object storage"
          usedBytes={storage.used_bytes}
          limitBytes={storage.limit_bytes}
          warnRatio={storage.warn_ratio}
        />
        <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <Figure label="Used" value={formatBytes(storage.used_bytes)} />
          <Figure
            label="Limit"
            value={storage.limit_bytes > 0 ? formatBytes(storage.limit_bytes) : 'None'}
          />
          <Figure label="Objects" value={formatNumber(storage.object_count)} />
          <Figure
            label="Per-user quota"
            value={storage.user_quota_bytes > 0 ? formatBytes(storage.user_quota_bytes) : 'Off'}
          />
          <Figure
            label="Last reconciled"
            value={
              <span title={formatDateTime(storage.last_reconciled_at)}>
                {formatRelativeTime(storage.last_reconciled_at)}
              </span>
            }
          />
        </dl>
      </AdminSection>

      <AdminSection
        title="Top users"
        description={`The ${TOP_USERS} users with the most stored data.`}
      >
        {storage.top_users.length === 0 ? (
          <p className="text-sm text-gray-500">No per-user usage recorded yet.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:-mx-6">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                  >
                    User
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                  >
                    Email
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                  >
                    Storage
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                  >
                    Objects
                  </th>
                  <th
                    scope="col"
                    className="py-3.5 pr-4 pl-3 text-right text-sm font-semibold text-gray-900 sm:pr-6"
                  >
                    Share
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {storage.top_users.map((item) => (
                  <tr key={item.user_id}>
                    <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap sm:pl-6">
                      {item.username ? (
                        <Link
                          href={`/admin/users/${encodeURIComponent(item.user_id)}`}
                          className="text-orange-600 hover:text-orange-900"
                        >
                          {item.username}
                        </Link>
                      ) : (
                        <span className="text-gray-500" title={item.user_id}>
                          Deleted user
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                      {item.email || '—'}
                    </td>
                    <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-900">
                      {formatBytes(item.bytes)}
                    </td>
                    <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                      {formatNumber(item.objects)}
                    </td>
                    <td className="py-4 pr-4 pl-3 text-right text-sm whitespace-nowrap text-gray-500 sm:pr-6">
                      {formatPercent(share(item.bytes))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminSection title="By prefix">
          <StorageByPrefix usage={storage.by_prefix} />
        </AdminSection>

        <AdminSection title="Prefix table">
          {prefixes.length === 0 ? (
            <p className="text-sm text-gray-500">No objects stored yet.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-6">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                    >
                      Prefix
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                    >
                      Storage
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"
                    >
                      Objects
                    </th>
                    <th
                      scope="col"
                      className="py-3.5 pr-4 pl-3 text-right text-sm font-semibold text-gray-900 sm:pr-6"
                    >
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {prefixes.map((item) => (
                    <tr key={item.prefix}>
                      <td className="py-4 pr-3 pl-4 font-mono text-sm whitespace-nowrap text-gray-900 sm:pl-6">
                        {item.prefix}/
                      </td>
                      <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-900">
                        {formatBytes(item.bytes)}
                      </td>
                      <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                        {formatNumber(item.objects)}
                      </td>
                      <td className="py-4 pr-4 pl-3 text-right text-sm whitespace-nowrap text-gray-500 sm:pr-6">
                        {formatPercent(share(item.bytes))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
