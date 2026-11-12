import { queryOptions, useQuery } from '@tanstack/react-query';
import { useSession, signIn, signOut } from 'next-auth/react';
import React, { createContext, useContext, useMemo, useEffect, useRef, ReactNode } from 'react';

import apiClient from '../utils/api-client';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  /** From GET /users/me (`is_admin`); false until that answer arrives. Cosmetic only: the API enforces admin. */
  isAdmin: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  /** True while a signed-in user's GET /users/me is still in flight, i.e. `user.isAdmin` is not known yet. */
  isAdminLoading: boolean;
  login: (callbackUrl?: string) => Promise<void>;
  logout: () => void;
}

/** GET /users/me, shared by every component that needs the API's view of the signed-in user. */
export const meQueryOptions = queryOptions({
  queryKey: ['me'],
  queryFn: () => apiClient.getCurrentUser(),
  staleTime: 5 * 60 * 1000,
  // A background lookup: on failure the user is simply treated as a non-admin, no error toast.
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
        isAdmin,
      };
    }
    return null;
  }, [session, status, isAdmin]);

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
