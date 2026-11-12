import { queryOptions, useQuery } from '@tanstack/react-query';
import { useSession, signIn, signOut } from 'next-auth/react';
import React, { createContext, useContext, useMemo, useEffect, useRef, ReactNode } from 'react';

import apiClient from '../utils/api-client';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  /**
   * From GET /users/me (`is_admin`); false until that answer arrives and when it fails. Cosmetic
   * only: the API enforces admin. Kept out of `user` so that `user` stays the same object when the
   * answer arrives, and effects keyed on `user` do not run again.
   */
  isAdmin: boolean;
  /** True while a signed-in user's GET /users/me is still in flight, i.e. `isAdmin` is not known yet. */
  isAdminLoading: boolean;
  login: (callbackUrl?: string) => Promise<void>;
  logout: () => void;
}

/** GET /users/me, shared by every component that needs the API's view of the signed-in user. */
export const meQueryOptions = queryOptions({
  queryKey: ['me'],
  // A background lookup: on any failure (a 401 included) the user is simply treated as a
  // non-admin, without an error toast or a re-login redirect. Session expiry is handled by
  // next-auth's refresh error below and by the pages' own API calls.
  queryFn: () => apiClient.getCurrentUser({ skipAuthRedirect: true }),
  staleTime: 5 * 60 * 1000,
  meta: { suppressErrorToast: true },
});

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: session, status } = useSession();
  const isSigningIn = useRef(false);
  const isAuthenticated = status === 'authenticated' && !!session?.user && !session.error;

  const { data: me, isPending: meLoading } = useQuery({
    ...meQueryOptions,
    enabled: isAuthenticated,
  });
  const isAdmin = me?.is_admin === true;

  // Derive user synchronously so there is never a render where isLoading=false but user=null
  const user = useMemo<AuthUser | null>(() => {
    if (status === 'authenticated' && session?.user && !session.error) {
      return {
        id: session.user.id ?? '',
        username: session.user.username ?? session.user.name ?? '',
        email: session.user.email ?? '',
        is_active: true,
      };
    }
    return null;
  }, [session, status]);

  useEffect(() => {
    if (session?.error === 'RefreshAccessTokenError') {
      // Token refresh failed — force re-login (guard against multiple rapid calls)
      if (!isSigningIn.current) {
        isSigningIn.current = true;
        signIn('authentik');
      }
    } else {
      isSigningIn.current = false;
    }
  }, [session]);

  const login = async (callbackUrl = '/dashboard') => {
    await signIn('authentik', { callbackUrl });
  };

  const logout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: status === 'loading',
        isAdmin,
        isAdminLoading: isAuthenticated && meLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
