import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import apiClient, { User, UserCreate } from '../utils/api-client';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (userData: UserCreate) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initAuth = async () => {
      // Check if token exists in local storage
      const hasToken = apiClient.initToken();
      if (hasToken) {
        try {
          // Fetch user data with token
          const userData = await apiClient.getCurrentUser();
          setUser(userData);
        } catch (error) {
          // Clear token if invalid
          apiClient.clearToken();
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      // Login and get token
      await apiClient.login(username, password);
      // Fetch user data
      const userData = await apiClient.getCurrentUser();
      setUser(userData);
      router.push('/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: UserCreate) => {
    setIsLoading(true);
    try {
      // Register user
      await apiClient.register(userData);
      // Login automatically after registration
      await login(userData.username, userData.password);
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    apiClient.clearToken();
    setUser(null);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
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