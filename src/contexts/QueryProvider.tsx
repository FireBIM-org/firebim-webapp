import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import React, { ReactNode } from 'react';
import { toast } from 'react-toastify';

/**
 * Extracts a human-readable error message from an API error.
 * Returns null for 401s — those are handled by the auth interceptor (re-login redirect).
 */
function getApiErrorMessage(error: unknown): string | null {
  if (isAxiosError(error)) {
    if (error.response?.status === 401) return null;
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    // FastAPI 422 returns detail as an array of validation errors
    if (Array.isArray(detail)) {
      return (detail as Array<{ msg: string }>).map((e) => e.msg).join(', ');
    }
    if (!error.response) return 'Network error — please check your connection';
    const status = error.response.status;
    if (status >= 500) return 'Server error — please try again later';
    return `Request failed (${status})`;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

// Create a client
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Background queries (e.g. ['me']) opt out of the toast with meta.suppressErrorToast.
      if (query.meta?.suppressErrorToast) return;
      const message = getApiErrorMessage(error);
      if (message) toast.error(message);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = getApiErrorMessage(error);
      if (message) toast.error(message);
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Don't retry 401s — re-login is triggered immediately by the interceptor
      retry: (failureCount, error) => {
        if (isAxiosError(error) && error.response?.status === 401) return false;
        return failureCount < 1;
      },
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
