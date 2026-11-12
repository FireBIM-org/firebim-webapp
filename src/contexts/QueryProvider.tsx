import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import React, { ReactNode } from 'react';
import { toast } from 'react-toastify';

import { getApiErrorMessage, shouldRetryQuery } from '../utils/api-errors';

function showErrorToast(error: unknown) {
  const message = getApiErrorMessage(error);
  // toastId dedupes identical messages, e.g. a burst of 429s from parallel queries
  if (message) toast.error(message, { toastId: message });
}

// Create a client
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: showErrorToast,
  }),
  mutationCache: new MutationCache({
    onError: showErrorToast,
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Don't retry 401s (re-login is triggered immediately by the interceptor), nor
      // rate-limit / size / storage rejections, which would fail again the same way.
      retry: shouldRetryQuery,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ children }) => {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
