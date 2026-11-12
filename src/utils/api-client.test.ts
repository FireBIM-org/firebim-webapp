import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from './api-client';

const signIn = vi.hoisted(() => vi.fn());
vi.mock('next-auth/react', () => ({ signIn }));

/** Every request fails with a 401, as the proxy answers when the session or the API token is dead. */
const unauthorized: AxiosAdapter = (config) => {
  const response = { status: 401, data: {}, config, headers: {} } as AxiosResponse;
  return Promise.reject(new AxiosError('Unauthorized', '401', config, null, response));
};

describe('ApiClient 401 handling', () => {
  let ApiClientClass: typeof ApiClient;

  beforeAll(async () => {
    // The re-login interceptor is only installed in the browser.
    vi.stubGlobal('window', {});
    ({ ApiClient: ApiClientClass } = await import('./api-client'));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  function client(): ApiClient {
    const instance = new ApiClientClass();
    instance.http.defaults.adapter = unauthorized;
    return instance;
  }

  // One test, in this order: after a redirect the module-level guard stays set until the page
  // navigates away, so a later redirect could not be observed.
  it('redirects to the login on a 401, unless the request has skipAuthRedirect', async () => {
    const api = client();
    await expect(api.getCurrentUser({ skipAuthRedirect: true })).rejects.toBeInstanceOf(AxiosError);
    expect(signIn).not.toHaveBeenCalled();

    await expect(api.getCurrentUser()).rejects.toBeInstanceOf(AxiosError);
    expect(signIn).toHaveBeenCalledWith('authentik');
  });
});
