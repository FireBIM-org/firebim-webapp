import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { useAuth, type AuthUser } from '../contexts/AuthContext';
import { adminAccess } from '../features/admin/access';
import { useRequireAuth } from './useRequireAuth';

/**
 * Guard for admin pages. Unauthenticated users go to /login (via useRequireAuth), signed-in
 * non-admins to /dashboard. `user` stays null until the user is known to be an admin, so pages
 * that render only when `user` is set never show admin data to anyone else.
 */
export function useRequireAdmin(): { user: AuthUser | null; isLoading: boolean } {
  const { user, isLoading } = useRequireAuth();
  const { isAdminLoading } = useAuth();
  const router = useRouter();
  const access = adminAccess({ sessionLoading: isLoading, adminLoading: isAdminLoading, user });

  useEffect(() => {
    if (access === 'forbidden') {
      router.replace('/dashboard');
    }
  }, [access, router]);

  return { user: access === 'allowed' ? user : null, isLoading: access === 'loading' };
}
