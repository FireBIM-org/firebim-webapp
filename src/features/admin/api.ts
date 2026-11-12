import type { AxiosInstance } from 'axios';

import type { components, operations } from '../../types/api';

import apiClient from '../../utils/api-client';

export type AdminOverview = components['schemas']['AdminOverview'];
export type AdminUser = components['schemas']['AdminUser'];
export type AdminUserList = components['schemas']['AdminUserList'];
export type AdminUserDetail = components['schemas']['AdminUserDetail'];
export type AdminUserUpdate = components['schemas']['AdminUserUpdate'];
export type AdminModelSummary = components['schemas']['AdminModelSummary'];
export type AdminIdsFileSummary = components['schemas']['AdminIdsFileSummary'];
export type AdminStorage = components['schemas']['AdminStorage'];
export type AdminStorageUser = components['schemas']['AdminStorageUser'];
export type AdminSystem = components['schemas']['AdminSystem'];
export type AdminSystemChecks = components['schemas']['AdminSystemChecks'];
export type StorageSummary = components['schemas']['StorageSummary'];
export type StoragePrefixUsage = components['schemas']['StoragePrefixUsage'];

export type AdminUsersParams = NonNullable<
  operations['list_users_admin_users_get']['parameters']['query']
>;
export type AdminUserSort = NonNullable<AdminUsersParams['sort']>;
export type SortOrder = NonNullable<AdminUsersParams['order']>;

/** React Query keys; everything lives under ['admin'] so one invalidation refreshes the dashboard. */
export const adminKeys = {
  all: ['admin'] as const,
  overview: () => ['admin', 'overview'] as const,
  users: (params: AdminUsersParams) => ['admin', 'users', params] as const,
  user: (id: string) => ['admin', 'user', id] as const,
  storage: (top: number) => ['admin', 'storage', top] as const,
  system: () => ['admin', 'system'] as const,
};

/** Typed client for the /admin routes of the API, called through the authenticated proxy. */
export function createAdminApi(http: AxiosInstance) {
  return {
    async getOverview(): Promise<AdminOverview> {
      const response = await http.get<AdminOverview>('/api/proxy/admin/overview');
      return response.data;
    },

    async listUsers(params: AdminUsersParams = {}): Promise<AdminUserList> {
      // Leave out an empty search so the API does not filter on ''.
      const { search, ...rest } = params;
      const query = search?.trim() ? { ...rest, search: search.trim() } : rest;
      const response = await http.get<AdminUserList>('/api/proxy/admin/users', { params: query });
      return response.data;
    },

    async getUser(id: string): Promise<AdminUserDetail> {
      const response = await http.get<AdminUserDetail>(
        `/api/proxy/admin/users/${encodeURIComponent(id)}`,
      );
      return response.data;
    },

    async updateUser(id: string, update: AdminUserUpdate): Promise<AdminUser> {
      const response = await http.patch<AdminUser>(
        `/api/proxy/admin/users/${encodeURIComponent(id)}`,
        update,
      );
      return response.data;
    },

    async getStorage(top = 10): Promise<AdminStorage> {
      const response = await http.get<AdminStorage>('/api/proxy/admin/storage', {
        params: { top },
      });
      return response.data;
    },

    async reconcileStorage(): Promise<StorageSummary> {
      const response = await http.post<StorageSummary>('/api/proxy/admin/storage/reconcile');
      return response.data;
    },

    async getSystem(): Promise<AdminSystem> {
      const response = await http.get<AdminSystem>('/api/proxy/admin/system');
      return response.data;
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;

const adminApi: AdminApi = createAdminApi(apiClient.http);
export default adminApi;
