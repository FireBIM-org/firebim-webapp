import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toast } from 'react-toastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryProvider } from './QueryProvider';

vi.mock('react-toastify', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/** The app's QueryClient, taken from the provider so the test covers its real QueryCache. */
function appQueryClient(): QueryClient {
  const clients: QueryClient[] = [];
  const Grab = ({ onClient }: { onClient: (client: QueryClient) => void }) => {
    onClient(useQueryClient());
    return null;
  };
  renderToStaticMarkup(
    <QueryProvider>
      <Grab onClient={(client) => clients.push(client)} />
    </QueryProvider>,
  );
  return clients[0];
}

function apiError(status: number, detail: string): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response = { status, data: { detail }, config, headers: {} } as AxiosResponse;
  return new AxiosError(detail, String(status), config, null, response);
}

async function failQuery(meta?: Record<string, unknown>, status = 500) {
  const client = appQueryClient();
  await client
    .fetchQuery({
      queryKey: ['test', Math.random()],
      queryFn: () => Promise.reject(apiError(status, `failed with ${status}`)),
      retry: false,
      meta,
    })
    .catch(() => undefined);
}

/** The messages toasted so far (ignoring toast options such as a dedupe toastId). */
function toasted(): unknown[] {
  return vi.mocked(toast.error).mock.calls.map(([message]) => message);
}

describe('QueryProvider error toasts', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it('toasts a failed query', async () => {
    await failQuery();
    expect(toasted()).toEqual(['failed with 500']);
  });

  it('does not toast a query with meta.suppressErrorToast', async () => {
    await failQuery({ suppressErrorToast: true });
    expect(toasted()).toEqual([]);
  });

  it('asks a suppressErrorToast predicate about each error', async () => {
    const notFound = (error: unknown) => (error as AxiosError).response?.status === 404;
    await failQuery({ suppressErrorToast: notFound }, 404);
    expect(toasted()).toEqual([]);
    await failQuery({ suppressErrorToast: notFound }, 500);
    expect(toasted()).toEqual(['failed with 500']);
  });
});
