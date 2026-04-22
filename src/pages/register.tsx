import type { GetServerSideProps } from 'next';

import { useRouter } from 'next/router';
import React, { useEffect } from 'react';

import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

// Derive the Authentik base URL from the issuer URL (server-side)
// AUTHENTIK_ISSUER_URL = https://auth.example.com/application/o/firebim/
// We need: https://auth.example.com
function getAuthentikBaseUrl(): string | null {
  const issuer = process.env.AUTHENTIK_ISSUER_URL;
  if (!issuer) return null;
  const match = issuer.match(/^(https?:\/\/[^/]+)/);
  return match ? match[1] : null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  const baseUrl = getAuthentikBaseUrl();
  return {
    props: {
      enrollmentUrl: baseUrl ? `${baseUrl}/if/flow/firebim-enrollment/` : null,
    },
  };
};

export default function Register({ enrollmentUrl }: { enrollmentUrl: string | null }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard');
      return;
    }
    if (!isLoading && !user && enrollmentUrl) {
      window.location.href = enrollmentUrl;
    }
  }, [isLoading, user, router, enrollmentUrl]);

  return (
    <Layout title="Register | FireBIM">
      <div className="flex min-h-[calc(100vh-12rem)] flex-col justify-center px-6 py-12 lg:px-8">
        <div className="text-center sm:mx-auto sm:w-full sm:max-w-md">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Redirecting to registration...</p>
        </div>
      </div>
    </Layout>
  );
}
