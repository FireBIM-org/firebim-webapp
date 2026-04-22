import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { useAuth, type AuthUser } from '../contexts/AuthContext';

/**
 * Drop-in replacement for useAuth() on protected pages.
 * Redirects unauthenticated users to /login, preserving the current URL as callbackUrl.
 */
export function useRequireAuth(): { user: AuthUser | null; isLoading: boolean } {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
    }
  }, [isLoading, user, router]);

  return { user, isLoading };
}
