import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { ReactNode } from 'react';

import Analytics from '@/components/Analytics';

import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

const Layout = ({ children, title = 'FireBIM App' }: LayoutProps) => {
  const { user, logout } = useAuth();
  const router = useRouter();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', requiresAuth: true },
    { name: 'IFC Models', href: '/ifc-models', requiresAuth: true },
    { name: 'IDS Files', href: '/ids-files', requiresAuth: true },
    { name: 'Analysis', href: '/analysis', requiresAuth: true },
    { name: 'RuleBuilder', href: '/rulebuilder', requiresAuth: true },
    { name: 'RuleBook', href: '/rulebook', requiresAuth: true },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Head>
        <title>{title}</title>
        <meta name="description" content="FireBIM webapp - BIM model analysis" />
        <link rel="icon" href="/favicon.ico" />
        <Analytics />
      </Head>

      <nav className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between">
            <div className="flex">
              <div className="flex flex-shrink-0 items-center">
                <Link href="/" className="text-xl font-bold text-orange-600">
                  FireBIM
                </Link>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => {
                  if (!user && item.requiresAuth) return null;

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`${
                        router.pathname === item.href
                          ? 'border-orange-500 text-gray-900'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      } inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium`}
                    >
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center">
              {user ? (
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-700">{user.username}</span>
                  <button onClick={logout} className="text-sm text-gray-700 hover:text-gray-900">
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-4">
                  <Link href="/login" className="text-sm text-gray-700 hover:text-gray-900">
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-grow bg-gray-50 py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
      </main>

      <footer className="mt-auto border-t border-gray-200 bg-white pt-8 pb-3">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} FireBIM Organization. All rights reserved.
            <br />
            <Link
              href="/build-info"
              className="mt-1 inline-block text-xs text-gray-300 hover:underline"
            >
              Build Info
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
