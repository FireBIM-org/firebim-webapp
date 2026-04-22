import React, { createContext, useContext, useMemo, useEffect, useRef, ReactNode } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (callbackUrl?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: session, status } = useSession();
  const isSigningIn = useRef(false);

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
    if (session?.error === "RefreshAccessTokenError") {
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
