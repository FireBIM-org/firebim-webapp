import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

import adminApi, { adminKeys, type AdminUsersParams } from './api';

// Admin numbers change slowly and every call costs the API a few aggregate queries.
const STALE_TIME = 30 * 1000;

export function isNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

/** The app's default retry policy (one retry, none for a 401), but an unknown id is not retried. */
export function retryUnlessNotFound(failureCount: number, error: unknown): boolean {
  if (isNotFound(error)) return false;
  if (isAxiosError(error) && error.response?.status === 401) return false;
  return failureCount < 1;
}

/** Pass `enabled: !!user` from useRequireAdmin so nothing is fetched before admin is confirmed. */
export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.overview(),
    queryFn: () => adminApi.getOverview(),
    staleTime: STALE_TIME,
    enabled,
  });
}

export function useAdminUsers(params: AdminUsersParams, enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => adminApi.listUsers(params),
    staleTime: STALE_TIME,
    // Keep the current page on screen while the next page, sort or search loads.
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAdminUser(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.user(id ?? ''),
    queryFn: () => adminApi.getUser(id as string),
    staleTime: STALE_TIME,
    enabled: enabled && !!id,
    // An unknown id stays unknown: no retry, and the page says so inline instead of a toast.
    retry: retryUnlessNotFound,
    meta: { suppressErrorToast: isNotFound },
  });
}

export function useAdminStorage(top: number, enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.storage(top),
    queryFn: () => adminApi.getStorage(top),
    staleTime: STALE_TIME,
    enabled,
  });
}

export function useAdminSystem(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.system(),
    queryFn: () => adminApi.getSystem(),
    staleTime: STALE_TIME,
    enabled,
  });
}

/** PATCH /admin/users/{id}; refreshes every admin query (lists, counts and the user's page). */
export function useSetUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.updateUser(id, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

/** POST /admin/storage/reconcile; refreshes every admin query that shows storage numbers. */
export function useReconcileStorage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.reconcileStorage(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  });
}
