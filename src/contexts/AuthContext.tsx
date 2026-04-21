import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<AuthUser | null>(null);
  const isSigningIn = useRef(false);

  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      // Token refresh failed — force re-login (guard against multiple rapid calls)
      if (!isSigningIn.current) {
        isSigningIn.current = true;
        signIn('authentik');
      }
      return;
    }
    isSigningIn.current = false;
    if (status === 'authenticated' && session?.user) {
      setUser({
        id: session.user.id ?? '',
        username: session.user.username ?? session.user.name ?? '',
        email: session.user.email ?? '',
        is_active: true,
      });
    } else {
      setUser(null);
    }
  }, [session, status]);

  const login = async () => {
    await signIn('authentik', { callbackUrl: '/dashboard' });
  };

  const logout = async () => {
    setUser(null);
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