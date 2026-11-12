import React from 'react';

import type { AdminSystem } from '../../features/admin/api';

import FileInfo from '../../components/FileInfo';
import AdminLayout, {
  AdminError,
  AdminLoading,
  AdminSection,
} from '../../features/admin/components/AdminLayout';
import { CheckStatus } from '../../features/admin/components/Badge';
import { formatBytes, formatNumber } from '../../features/admin/format';
import { useAdminSystem } from '../../features/admin/hooks';
import { useRequireAdmin } from '../../hooks/useRequireAdmin';

const CHECK_LABELS: Record<keyof AdminSystem['checks'], string> = {
  database: 'Database (PostgreSQL)',
  s3: 'Object storage (S3)',
  celery: 'Background workers (Celery)',
  authentik: 'Identity provider (Authentik)',
};

export default function AdminSystemPage() {
  const { user } = useRequireAdmin();
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useAdminSystem(!!user);

  if (!user) return <AdminLoading />;

  return (
    <AdminLayout
      title="System"
      description="API build, dependency health as seen by the API, and the limits it enforces."
      actions={
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:opacity-50"
        >
          {isFetching ? 'Checking…' : 'Check again'}
        </button>
      }
    >
      {isError && !data ? (
        <AdminError onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
      ) : (
        <SystemDetails system={data} checkedAt={dataUpdatedAt} />
      )}
    </AdminLayout>
  );
}

function SystemDetails({ system, checkedAt }: { system: AdminSystem; checkedAt: number }) {
  const { build, limits } = system;
  const checks = Object.keys(CHECK_LABELS) as Array<keyof AdminSystem['checks']>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FileInfo
          title="API build"
          fields={[
            { label: 'Environment', value: system.environment },
            { label: 'Git branch', value: build.git_branch },
            { label: 'Git commit', value: <span className="font-mono">{build.git_commit}</span> },
            { label: 'Build time', value: build.build_time },
          ]}
        />
        <FileInfo
          title="Webapp build"
          fields={[
            { label: 'Git branch', value: process.env.NEXT_PUBLIC_GIT_BRANCH || 'Unknown' },
            {
              label: 'Git commit',
              value: (
                <span className="font-mono">{process.env.NEXT_PUBLIC_GIT_COMMIT || 'Unknown'}</span>
              ),
            },
            { label: 'Build time', value: process.env.NEXT_PUBLIC_BUILD_TIME || 'Unknown' },
          ]}
        />
      </div>

      <AdminSection
        title="Health checks"
        description={`Checked by the API at ${new Date(checkedAt).toLocaleTimeString()}.`}
      >
        <ul className="divide-y divide-gray-200">
          {checks.map((name) => (
            <li key={name} className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm text-gray-900">{CHECK_LABELS[name]}</span>
              <CheckStatus status={system.checks[name]} />
            </li>
          ))}
        </ul>
      </AdminSection>

      <FileInfo
        title="Configured limits"
        description="Set through the API's environment (see the API README)."
        fields={[
          {
            label: 'Storage hard limit',
            value: limitBytes(limits.storage_hard_limit_bytes, 'Disabled'),
          },
          { label: 'Per-user quota', value: limitBytes(limits.storage_user_quota_bytes, 'Off') },
          { label: 'Max upload size', value: limitBytes(limits.max_upload_bytes, 'Unlimited') },
          { label: 'Max JSON body', value: limitBytes(limits.max_json_body_bytes, 'Unlimited') },
          {
            label: 'Rate limiting',
            value: limits.rate_limit_enabled ? 'Enabled' : 'Disabled',
          },
          { label: 'Default rate limit (per user)', value: limits.rate_limit_default },
          { label: 'Expensive routes (per user)', value: limits.rate_limit_expensive },
          { label: 'Anonymous (per IP)', value: limits.rate_limit_anon },
        ]}
      />
    </div>
  );
}

/** `931.3 GiB (1,000,000,000,000 bytes)`, or `zeroText` when the limit is 0 (disabled). */
function limitBytes(bytes: number, zeroText: string) {
  if (bytes <= 0) return zeroText;
  return (
    <span title={`${formatNumber(bytes)} bytes`}>
      {formatBytes(bytes)} <span className="text-gray-500">({formatNumber(bytes)} bytes)</span>
    </span>
  );
}
