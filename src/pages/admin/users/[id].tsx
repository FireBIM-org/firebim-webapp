import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import { toast } from 'react-toastify';

import type { AdminUserDetail } from '../../../features/admin/api';

import BackLink from '../../../components/BackLink';
import ConfirmDialog from '../../../components/ConfirmDialog';
import FileInfo from '../../../components/FileInfo';
import PrimaryButton from '../../../components/PrimaryButton';
import { meQueryOptions } from '../../../contexts/AuthContext';
import AdminLayout, {
  AdminError,
  AdminLoading,
  AdminSection,
} from '../../../features/admin/components/AdminLayout';
import Badge from '../../../features/admin/components/Badge';
import StorageByPrefix from '../../../features/admin/components/StorageByPrefix';
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
} from '../../../features/admin/format';
import { isNotFound, useAdminUser, useSetUserActive } from '../../../features/admin/hooks';
import { useRequireAdmin } from '../../../hooks/useRequireAdmin';

export default function AdminUserPage() {
  const { user } = useRequireAdmin();
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const { data, isLoading, isError, error, refetch } = useAdminUser(id, !!user);
  // The API's id of the signed-in admin (session ids are Authentik subjects, not API user ids).
  const { data: me } = useQuery({ ...meQueryOptions, enabled: !!user });

  if (!user) return <AdminLoading />;

  const notFound = isNotFound(error);

  return (
    <AdminLayout
      title={data?.username ?? 'User'}
      description={data?.email}
      actions={data && <ActiveToggle detail={data} isSelf={me?.id === data.id} />}
    >
      <BackLink href="/admin/users" className="text-sm">
        &larr; All users
      </BackLink>
      <div className="mt-4">
        {isLoading || !router.isReady ? (
          <div className="h-64 animate-pulse rounded-lg bg-gray-200" />
        ) : notFound ? (
          <AdminError>This user does not exist.</AdminError>
        ) : isError || !data ? (
          <AdminError onRetry={() => refetch()} />
        ) : (
          <UserDetail detail={data} />
        )}
      </div>
    </AdminLayout>
  );
}

function ActiveToggle({ detail, isSelf }: { detail: AdminUserDetail; isSelf: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const setActive = useSetUserActive();
  const deactivate = detail.is_active;

  const handleConfirm = () => {
    setActive.mutate(
      { id: detail.id, isActive: !deactivate },
      {
        onSuccess: (updated) => {
          toast.success(
            `${updated.username} is now ${updated.is_active ? 'active' : 'deactivated'}`,
          );
        },
        // Errors are toasted by the global MutationCache handler.
        onSettled: () => setConfirming(false),
      },
    );
  };

  const selfNote = isSelf && deactivate ? 'You cannot deactivate your own account' : undefined;

  return (
    <>
      {deactivate ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={isSelf}
          title={selfNote}
          className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm ring-1 ring-red-300 ring-inset hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Deactivate
        </button>
      ) : (
        <PrimaryButton onClick={() => setConfirming(true)}>Activate</PrimaryButton>
      )}
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleConfirm}
        isLoading={setActive.isPending}
        title={deactivate ? `Deactivate ${detail.username}?` : `Activate ${detail.username}?`}
        description={
          deactivate
            ? 'The user is refused on every API request until an admin activates the account again. Their models, IDS files and other data are kept.'
            : 'The user can sign in and use FireBIM again.'
        }
        confirmLabel={deactivate ? 'Deactivate' : 'Activate'}
      />
    </>
  );
}

function adminLabel(isAdmin: boolean | null) {
  if (isAdmin === null) return 'Unknown (determined when the user next uses the API)';
  return isAdmin ? 'Admin' : 'User';
}

function UserDetail({ detail }: { detail: AdminUserDetail }) {
  return (
    <div className="space-y-6">
      <FileInfo
        title="Account"
        fields={[
          {
            label: 'Status',
            value: (
              <span className="flex gap-1.5">
                {detail.is_active ? (
                  <Badge tone="green">Active</Badge>
                ) : (
                  <Badge tone="red">Inactive</Badge>
                )}
                {detail.is_admin && <Badge tone="orange">Admin</Badge>}
              </span>
            ),
          },
          { label: 'Role', value: adminLabel(detail.is_admin) },
          { label: 'Username', value: detail.username },
          { label: 'Email', value: detail.email || '—' },
          { label: 'Created', value: formatDateTime(detail.created_at) },
          {
            label: 'Last seen',
            value: (
              <span title={formatDateTime(detail.last_seen_at)}>
                {formatRelativeTime(detail.last_seen_at)}
              </span>
            ),
          },
          { label: 'IFC models', value: formatNumber(detail.ifc_models) },
          { label: 'IDS files', value: formatNumber(detail.ids_files) },
          {
            label: 'Storage',
            value: `${formatBytes(detail.storage_bytes)} in ${formatNumber(detail.storage_objects)} objects`,
          },
          { label: 'User ID', value: <span className="font-mono text-xs">{detail.id}</span> },
        ]}
      />

      <AdminSection
        title="Storage by prefix"
        description={
          detail.storage_by_prefix_complete
            ? 'Live listing of the objects that belong to this user.'
            : 'Incomplete: the object listing failed or the user has too many uploads to list them all.'
        }
      >
        <StorageByPrefix
          usage={detail.storage_by_prefix}
          emptyText={
            detail.storage_by_prefix_complete
              ? 'This user has no stored objects.'
              : 'The object listing is not available right now.'
          }
        />
      </AdminSection>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminSection
          title="Recent IFC models"
          description={`${formatNumber(detail.recent_models.length)} of ${formatNumber(detail.ifc_models)}`}
        >
          {detail.recent_models.length === 0 ? (
            <p className="text-sm text-gray-500">No IFC models.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {detail.recent_models.map((model) => (
                <li key={model.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{model.filename}</p>
                    <p className="text-xs text-gray-500" title={formatDateTime(model.created_at)}>
                      {formatRelativeTime(model.created_at)}
                    </p>
                  </div>
                  <ModelStatus processed={model.processed} status={model.processing_status} />
                </li>
              ))}
            </ul>
          )}
        </AdminSection>

        <AdminSection
          title="Recent IDS files"
          description={`${formatNumber(detail.recent_ids_files.length)} of ${formatNumber(detail.ids_files)}`}
        >
          {detail.recent_ids_files.length === 0 ? (
            <p className="text-sm text-gray-500">No IDS files.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {detail.recent_ids_files.map((file) => (
                <li key={file.id} className="py-3">
                  <p className="truncate text-sm font-medium text-gray-900">{file.filename}</p>
                  <p className="text-xs text-gray-500" title={formatDateTime(file.created_at)}>
                    {formatRelativeTime(file.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

function ModelStatus({ processed, status }: { processed: boolean; status: string }) {
  if (processed) return <Badge tone="green">Processed</Badge>;
  if (status === 'processing') return <Badge tone="yellow">Processing</Badge>;
  return <Badge tone="gray">{status === 'pending' || !status ? 'Pending' : status}</Badge>;
}
