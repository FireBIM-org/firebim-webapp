import React, { ReactNode } from 'react';

import Layout from '../../../components/Layout';
import LoadingSpinner from '../../../components/LoadingSpinner';
import AdminNav from './AdminNav';

interface AdminLayoutProps {
  title: string;
  description?: ReactNode;
  /** Buttons shown to the right of the heading. */
  actions?: ReactNode;
  children: ReactNode;
}

/** The shared Layout with the admin heading and sub-navigation. */
const AdminLayout: React.FC<AdminLayoutProps> = ({ title, description, actions, children }) => (
  <Layout title={`Admin · ${title} | FireBIM`}>
    <AdminNav />
    <div className="mt-6 sm:flex sm:items-center">
      <div className="sm:flex-auto">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description && <p className="mt-2 text-sm text-gray-700">{description}</p>}
      </div>
      {actions && <div className="mt-4 flex gap-3 sm:mt-0 sm:ml-16 sm:flex-none">{actions}</div>}
    </div>
    <div className="mt-6">{children}</div>
  </Layout>
);

export default AdminLayout;

/** What admin pages render until the user is known to be an admin: no admin chrome, no data. */
export const AdminLoading: React.FC = () => (
  <Layout title="Loading... | FireBIM">
    <LoadingSpinner />
  </Layout>
);

/** A white card section with a heading, used throughout the admin pages. */
export const AdminSection: React.FC<{
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ title, description, actions, children, className = '' }) => (
  <section className={`overflow-hidden rounded-lg bg-white shadow ${className}`}>
    <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-4 sm:px-6">
      <div>
        <h2 className="text-lg leading-6 font-medium text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions}
    </div>
    <div className="px-4 py-5 sm:px-6">{children}</div>
  </section>
);

/** Shown when an admin query failed (the global handler has already toasted the error). */
export const AdminError: React.FC<{ onRetry?: () => void; children?: ReactNode }> = ({
  onRetry,
  children = 'Could not load this data.',
}) => (
  <div role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">
    {children}
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="ml-3 font-medium text-red-800 underline hover:text-red-900"
      >
        Try again
      </button>
    )}
  </div>
);
