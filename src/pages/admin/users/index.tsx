import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import Link from 'next/link';
import { useRouter, type NextRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

import type { AdminUserSort } from '../../../features/admin/api';

import LoadingSpinner from '../../../components/LoadingSpinner';
import AdminLayout, {
  AdminError,
  AdminLoading,
} from '../../../features/admin/components/AdminLayout';
import Badge from '../../../features/admin/components/Badge';
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
} from '../../../features/admin/format';
import { useAdminUsers } from '../../../features/admin/hooks';
import {
  USERS_SEARCH_MAX_LENGTH,
  nextSort,
  pageRange,
  parseUsersQuery,
  toUsersParams,
  toUsersQuery,
  type UsersTableState,
} from '../../../features/admin/usersQuery';
import { useRequireAdmin } from '../../../hooks/useRequireAdmin';

const SEARCH_DEBOUNCE_MS = 300;

const SORT_LABELS: Record<AdminUserSort, string> = {
  username: 'username',
  created_at: 'creation date',
  last_seen_at: 'last seen',
  storage_bytes: 'storage',
};

/** Write the table state to the URL without a full navigation. */
function replaceTableState(router: NextRouter, next: UsersTableState) {
  router.replace({ pathname: router.pathname, query: toUsersQuery(next) }, undefined, {
    shallow: true,
    scroll: false,
  });
}

export default function AdminUsersPage() {
  const { user } = useRequireAdmin();
  const router = useRouter();

  // The table state lives in the URL, which is only known once the router is ready.
  if (!user || !router.isReady) return <AdminLoading />;

  return (
    <AdminLayout title="Users" description="Everyone who has signed in to FireBIM.">
      <UsersTable />
    </AdminLayout>
  );
}

function UsersTable() {
  const router = useRouter();
  const state = parseUsersQuery(router.query);
  const [searchInput, setSearchInput] = useState(state.search);
  // ?q as last seen in the URL, and the search this table last wrote there itself. When ?q changes
  // to anything else, the change came from outside (the Users tab, back/forward): the search box
  // follows it instead of writing its old text back.
  const [seenSearch, setSeenSearch] = useState(state.search);
  const [writtenSearch, setWrittenSearch] = useState<string | null>(null);
  if (state.search !== seenSearch) {
    setSeenSearch(state.search);
    setWrittenSearch(null);
    if (state.search !== writtenSearch) setSearchInput(state.search);
  }

  const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useAdminUsers(
    toUsersParams(state),
    true,
  );

  const update = (next: UsersTableState) => replaceTableState(router, next);

  // Debounce typing into the URL (and so into the query key). Sorting meanwhile restarts the
  // timer with the new sort, so neither change is lost.
  const { search, page, sort, order } = state;
  useEffect(() => {
    if (searchInput.trim() === search.trim()) return;
    const timer = setTimeout(() => {
      setWrittenSearch(searchInput.trim());
      replaceTableState(router, { search: searchInput, page: 1, sort, order });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search, sort, order, router]);

  const total = data?.total ?? 0;
  const range = pageRange(page, total);

  // A page past the end (an old bookmark, or users deactivated or filtered away meanwhile): go to
  // the last page that exists.
  const pastEnd = !!data && !isPlaceholderData && page > range.pages;
  useEffect(() => {
    if (pastEnd) replaceTableState(router, { search, page: range.pages, sort, order });
  }, [pastEnd, search, range.pages, sort, order, router]);

  return (
    <div>
      <div className="relative max-w-md">
        <label htmlFor="admin-user-search" className="sr-only">
          Search users
        </label>
        <MagnifyingGlassIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400"
        />
        <input
          id="admin-user-search"
          type="search"
          value={searchInput}
          maxLength={USERS_SEARCH_MAX_LENGTH}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search username or email"
          className="block w-full rounded-md border-gray-300 pl-10 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500"
        />
      </div>

      <div className="mt-6 flex flex-col">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="ring-opacity-5 overflow-hidden shadow ring-1 ring-black md:rounded-lg">
              {isLoading ? (
                <div className="bg-white py-12">
                  <LoadingSpinner />
                </div>
              ) : isError && !data ? (
                <div className="bg-white p-4">
                  <AdminError onRetry={() => refetch()} />
                </div>
              ) : !data || data.items.length === 0 ? (
                <div className="bg-white px-4 py-12 text-center text-gray-500">
                  {state.search ? `No users match “${state.search}”.` : 'No users on this page.'}
                </div>
              ) : (
                <table
                  className={`min-w-full divide-y divide-gray-300 ${isFetching ? 'opacity-60' : ''}`}
                  aria-busy={isFetching || undefined}
                >
                  <caption className="sr-only">
                    Users, sorted by {SORT_LABELS[state.sort]} ({state.order}ending)
                  </caption>
                  <thead className="bg-gray-50">
                    <tr>
                      <SortHeader column="username" state={state} onSort={update} first>
                        Username
                      </SortHeader>
                      <Th>Email</Th>
                      <Th>Status</Th>
                      <SortHeader column="created_at" state={state} onSort={update}>
                        Created
                      </SortHeader>
                      <SortHeader column="last_seen_at" state={state} onSort={update}>
                        Last seen
                      </SortHeader>
                      <Th align="right">Models</Th>
                      <Th align="right">IDS</Th>
                      <SortHeader
                        column="storage_bytes"
                        state={state}
                        onSort={update}
                        align="right"
                      >
                        Storage
                      </SortHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap sm:pl-6">
                          <Link
                            href={`/admin/users/${encodeURIComponent(item.id)}`}
                            className="text-orange-600 hover:text-orange-900"
                          >
                            {item.username}
                          </Link>
                        </td>
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                          {item.email || '—'}
                        </td>
                        <td className="px-3 py-4 text-sm whitespace-nowrap">
                          <span className="flex gap-1.5">
                            {item.is_active ? (
                              <Badge tone="green">Active</Badge>
                            ) : (
                              <Badge tone="red">Inactive</Badge>
                            )}
                            {item.is_admin && <Badge tone="orange">Admin</Badge>}
                          </span>
                        </td>
                        <td
                          className="px-3 py-4 text-sm whitespace-nowrap text-gray-500"
                          title={formatDateTime(item.created_at)}
                        >
                          {new Date(item.created_at).toLocaleDateString()}
                        </td>
                        <td
                          className="px-3 py-4 text-sm whitespace-nowrap text-gray-500"
                          title={formatDateTime(item.last_seen_at)}
                        >
                          {formatRelativeTime(item.last_seen_at)}
                        </td>
                        <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                          {formatNumber(item.ifc_models)}
                        </td>
                        <td className="px-3 py-4 text-right text-sm whitespace-nowrap text-gray-500">
                          {formatNumber(item.ids_files)}
                        </td>
                        <td
                          className="py-4 pr-4 pl-3 text-right text-sm whitespace-nowrap text-gray-500 sm:pr-6"
                          title={`${formatNumber(item.storage_objects)} objects`}
                        >
                          {formatBytes(item.storage_bytes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {data && (
        <nav
          aria-label="Pagination"
          className="mt-4 flex items-center justify-between text-sm text-gray-700"
        >
          <p>
            {total === 0
              ? 'No users'
              : `Showing ${formatNumber(range.first)}–${formatNumber(range.last)} of ${formatNumber(total)}`}
          </p>
          <div className="flex items-center gap-3">
            <span>
              Page {formatNumber(range.page)} of {formatNumber(range.pages)}
            </span>
            <PageButton
              disabled={range.page <= 1}
              onClick={() => update({ ...state, page: range.page - 1 })}
            >
              Previous
            </PageButton>
            <PageButton
              disabled={range.page >= range.pages}
              onClick={() => update({ ...state, page: range.page + 1 })}
            >
              Next
            </PageButton>
          </div>
        </nav>
      )}
    </div>
  );
}

const Th: React.FC<{ children: React.ReactNode; align?: 'left' | 'right' }> = ({
  children,
  align = 'left',
}) => (
  <th
    scope="col"
    className={`px-3 py-3.5 text-sm font-semibold text-gray-900 ${align === 'right' ? 'text-right' : 'text-left'}`}
  >
    {children}
  </th>
);

function SortHeader({
  column,
  state,
  onSort,
  children,
  align = 'left',
  first = false,
}: {
  column: AdminUserSort;
  state: UsersTableState;
  onSort: (next: UsersTableState) => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  first?: boolean;
}) {
  const active = state.sort === column;
  const Icon = active && state.order === 'asc' ? ChevronUpIcon : ChevronDownIcon;
  return (
    <th
      scope="col"
      aria-sort={active ? (state.order === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`py-3.5 text-sm font-semibold text-gray-900 ${first ? 'pr-3 pl-4 sm:pl-6' : 'px-3'} ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(state, column))}
        className="group inline-flex items-center gap-1 hover:text-orange-700"
      >
        {children}
        <Icon
          aria-hidden="true"
          className={`h-4 w-4 ${active ? 'text-gray-700' : 'text-gray-300 group-hover:text-gray-500'}`}
        />
      </button>
    </th>
  );
}

const PageButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => (
  <button
    type="button"
    className="rounded-md bg-white px-3 py-1.5 font-medium text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    {...props}
  />
);
