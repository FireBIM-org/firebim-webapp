import type { AxiosInstance } from 'axios';

import { describe, expect, it, vi } from 'vitest';

import { adminKeys, createAdminApi } from './api';

function stubHttp() {
  const respond = vi.fn().mockResolvedValue({ data: { ok: true } });
  const http = { get: respond, post: respond, patch: respond } as unknown as AxiosInstance;
  return { http, respond };
}

describe('createAdminApi', () => {
  it('lists users through the proxy with the given parameters', async () => {
    const { http, respond } = stubHttp();
    const result = await createAdminApi(http).listUsers({
      search: ' anna ',
      limit: 25,
      offset: 50,
      sort: 'username',
      order: 'asc',
    });
    expect(result).toEqual({ ok: true });
    expect(respond).toHaveBeenCalledWith('/api/proxy/admin/users', {
      params: { search: 'anna', limit: 25, offset: 50, sort: 'username', order: 'asc' },
    });
  });

  it('drops a blank search', async () => {
    const { http, respond } = stubHttp();
    await createAdminApi(http).listUsers({ search: '  ', limit: 10 });
    expect(respond).toHaveBeenCalledWith('/api/proxy/admin/users', { params: { limit: 10 } });
  });

  it('encodes user ids in the path', async () => {
    const { http, respond } = stubHttp();
    const api = createAdminApi(http);
    await api.getUser('a/b');
    expect(respond).toHaveBeenLastCalledWith('/api/proxy/admin/users/a%2Fb');
    await api.updateUser('a/b', { is_active: false });
    expect(respond).toHaveBeenLastCalledWith('/api/proxy/admin/users/a%2Fb', {
      is_active: false,
    });
  });

  it('calls the remaining endpoints', async () => {
    const { http, respond } = stubHttp();
    const api = createAdminApi(http);
    await api.getOverview();
    expect(respond).toHaveBeenLastCalledWith('/api/proxy/admin/overview');
    await api.getStorage(5);
    expect(respond).toHaveBeenLastCalledWith('/api/proxy/admin/storage', { params: { top: 5 } });
    await api.reconcileStorage();
    expect(respond).toHaveBeenLastCalledWith('/api/proxy/admin/storage/reconcile');
    await api.getSystem();
    expect(respond).toHaveBeenLastCalledWith('/api/proxy/admin/system');
  });
});

describe('adminKeys', () => {
  it('nests every key under the admin root', () => {
    for (const key of [
      adminKeys.overview(),
      adminKeys.users({ limit: 1 }),
      adminKeys.user('x'),
      adminKeys.storage(10),
      adminKeys.system(),
    ]) {
      expect(key[0]).toBe(adminKeys.all[0]);
    }
  });
});
