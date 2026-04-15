import type { AppProps } from 'next/app'

import { SessionProvider } from 'next-auth/react'
import React from 'react'
import { ToastContainer } from 'react-toastify'

import { AuthProvider } from '../contexts/AuthContext'
import { QueryProvider } from '../contexts/QueryProvider'
import '../styles/globals.css'
import 'react-toastify/dist/ReactToastify.css'

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <QueryProvider>
        <AuthProvider>
          <Component {...pageProps} />
          <ToastContainer position='top-right' autoClose={5000} />
        </AuthProvider>
      </QueryProvider>
    </SessionProvider>
  )
}
