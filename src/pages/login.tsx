import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Login() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If already logged in, go to dashboard
    if (!isLoading && user) {
      router.push('/dashboard');
      return;
    }
    // Automatically redirect to Authentik sign-in
    if (!isLoading && !user) {
      login();
    }
  }, [isLoading, user, router, login]);

  return (
    <Layout title="Login | FireBIM">
      <div className="flex min-h-[calc(100vh-12rem)] flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    </Layout>
  );
}