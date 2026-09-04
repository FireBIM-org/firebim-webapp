import type { AppProps } from 'next/app';

import { SessionProvider } from 'next-auth/react';
import React from 'react';
import { ToastContainer } from 'react-toastify';

import { AuthProvider } from '../contexts/AuthContext';
import { QueryProvider } from '../contexts/QueryProvider';
import '../styles/globals.css';
import 'react-toastify/dist/ReactToastify.css';

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    // refetchInterval keeps the session (and access token) fresh client-side.
    // Without it, token expiry is only discovered when the proxy returns 401.
    // 55 minutes (3300 s) refreshes shortly before the one-hour Authentik token lifetime.
    <SessionProvider session={session} refetchInterval={3300} refetchOnWindowFocus>
      <QueryProvider>
        <AuthProvider>
          <Component {...pageProps} />
          <ToastContainer position="top-right" autoClose={5000} />
        </AuthProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
