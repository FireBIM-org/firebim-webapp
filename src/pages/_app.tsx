import React from 'react';
import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from '../contexts/AuthContext';
import { QueryProvider } from '../contexts/QueryProvider';
import '../styles/globals.css';
import 'react-toastify/dist/ReactToastify.css';

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    // refetchInterval keeps the session (and access token) fresh client-side.
    // Without it, token expiry is only discovered when the proxy returns 401.
    // 4 minutes (240 s) ensures refresh runs before the default 5-min token lifetime.
    <SessionProvider session={session} refetchInterval={240} refetchOnWindowFocus>
      <QueryProvider>
        <AuthProvider>
          <Component {...pageProps} />
          <ToastContainer position="top-right" autoClose={5000} />
        </AuthProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
