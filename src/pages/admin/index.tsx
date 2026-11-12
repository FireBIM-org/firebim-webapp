import Link from 'next/link';
import React from 'react';

import AdminLayout, {
  AdminError,
  AdminLoading,
  AdminSection,
} from '../../features/admin/components/AdminLayout';
import StatCard from '../../features/admin/components/StatCard';
import StorageByPrefix from '../../features/admin/components/StorageByPrefix';
import UsageMeter from '../../features/admin/components/UsageMeter';
import { formatNumber, formatRelativeTime } from '../../features/admin/format';
import { useAdminOverview } from '../../features/admin/hooks';
import { useRequireAdmin } from '../../hooks/useRequireAdmin';

const QUICK_LINKS = [
  {
    href: '/admin/users',
    title: 'Users',
    text: 'Search users, see their content, (de)activate accounts',
  },
  {
    href: '/admin/storage',
    title: 'Storage',
    text: 'Bucket usage, largest users, reconcile counters',
  },
  {
    href: '/admin/system',
    title: 'System',
    text: 'Build, dependency health and configured limits',
  },
  { href: '/build-info', title: 'Build info', text: 'Webapp and API build details' },
];

export default function AdminOverviewPage() {
  const { user } = useRequireAdmin();
  const { data, isLoading, isError, refetch } = useAdminOverview(!!user);

  if (!user) return <AdminLoading />;

  const users = data?.users;
  const content = data?.content;
  const storage = data?.storage;
  const queue = content ? content.models_pending + content.models_processing : 0;

  return (
    <AdminLayout
      title="Overview"
      description={
        data ? `Updated ${formatRelativeTime(data.generated_at)}` : 'Usage of this FireBIM instance'
      }
    >
      {isError && !data ? (
        <AdminError onRetry={() => refetch()} />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Users"
              isLoading={isLoading}
              value={formatNumber(users?.total)}
              detail={
                users &&
                `${formatNumber(users.active)} active accounts · ${formatNumber(users.new_30d)} new in 30 days`
              }
              href="/admin/users"
              linkLabel="View users"
            />
            <StatCard
              label="Active users (7 days)"
              isLoading={isLoading}
              value={formatNumber(users?.active_7d)}
              detail="Signed-in users who used the app"
              href="/admin/users?sort=last_seen_at"
              linkLabel="Recently active"
            />
            <StatCard
              label="New users (7 days)"
              isLoading={isLoading}
              value={formatNumber(users?.new_7d)}
              href="/admin/users"
              linkLabel="Newest users"
            />
            <StatCard
              label="IFC models"
              isLoading={isLoading}
              value={formatNumber(content?.ifc_models)}
              detail={content && `${formatNumber(content.models_processed)} processed`}
            />
            <StatCard
              label="IDS files"
              isLoading={isLoading}
              value={formatNumber(content?.ids_files)}
            />
            <StatCard
              label="Processing queue"
              isLoading={isLoading}
              value={formatNumber(queue)}
              detail={
                content &&
                `${formatNumber(content.models_processing)} processing · ${formatNumber(content.models_pending)} pending`
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AdminSection
              title="Storage"
              description={
                storage &&
                `${formatNumber(storage.object_count)} objects · last reconciled ${formatRelativeTime(storage.last_reconciled_at)}`
              }
            >
              {storage ? (
                <UsageMeter
                  label="Object storage"
                  usedBytes={storage.used_bytes}
                  limitBytes={storage.limit_bytes}
                  warnRatio={storage.warn_ratio}
                />
              ) : (
                <div className="h-12 animate-pulse rounded bg-gray-200" />
              )}
              <Link
                href="/admin/storage"
                className="mt-4 inline-block text-sm font-medium text-orange-600 hover:text-orange-500"
              >
                Storage details <span aria-hidden="true">&rarr;</span>
              </Link>
            </AdminSection>

            <AdminSection title="Storage by prefix">
              {storage ? (
                <StorageByPrefix usage={storage.by_prefix} />
              ) : (
                <div className="h-24 animate-pulse rounded bg-gray-200" />
              )}
            </AdminSection>
          </div>

          <div>
            <h2 className="text-lg font-medium text-gray-900">Quick links</h2>
            <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {QUICK_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg bg-white p-6 shadow hover:bg-orange-50"
                >
                  <h3 className="text-lg font-medium text-gray-900">{link.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{link.text}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
