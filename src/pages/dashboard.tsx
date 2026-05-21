import { BookOpenIcon, PuzzlePieceIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import React from 'react';

import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import { useRequireAuth } from '../hooks/useRequireAuth';
import apiClient from '../utils/api-client';

export default function Dashboard() {
  const { user, isLoading: authLoading } = useRequireAuth();

  // Fetch user's IFC models
  const { data: models, isLoading: modelsLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.getModels(),
    enabled: !!user,
  });

  // Fetch user's IDS files
  const { data: idsFiles, isLoading: idsLoading } = useQuery({
    queryKey: ['ids-files'],
    queryFn: () => apiClient.getIdsFiles(),
    enabled: !!user,
  });

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard | FireBIM">
      <div className="py-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">Welcome back, {user.username}!</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Stats Cards */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="px-4 py-5 sm:p-6">
            <dl>
              <dt className="truncate text-sm font-medium text-gray-500">Total IFC Models</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {modelsLoading ? (
                  <div className="h-8 w-12 animate-pulse rounded bg-gray-200"></div>
                ) : (
                  models?.length || 0
                )}
              </dd>
            </dl>
          </div>
          <div className="bg-gray-50 px-4 py-4 sm:px-6">
            <Link
              href="/ifc-models"
              className="text-sm font-medium text-orange-600 hover:text-orange-500"
            >
              View all models <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="px-4 py-5 sm:p-6">
            <dl>
              <dt className="truncate text-sm font-medium text-gray-500">Total IDS Files</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {idsLoading ? (
                  <div className="h-8 w-12 animate-pulse rounded bg-gray-200"></div>
                ) : (
                  idsFiles?.length || 0
                )}
              </dd>
            </dl>
          </div>
          <div className="bg-gray-50 px-4 py-4 sm:px-6">
            <Link
              href="/ids-files"
              className="text-sm font-medium text-orange-600 hover:text-orange-500"
            >
              View all IDS files <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="px-4 py-5 sm:p-6">
            <dl>
              <dt className="truncate text-sm font-medium text-gray-500">Run Analysis</dt>
              <dd className="mt-1 text-lg font-medium text-gray-900">
                Validate IFC models against IDS files
              </dd>
            </dl>
          </div>
          <div className="bg-gray-50 px-4 py-4 sm:px-6">
            <Link
              href="/analysis"
              className="text-sm font-medium text-orange-600 hover:text-orange-500"
            >
              Start new analysis <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900">Quick Actions</h2>
        <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/ifc-models/upload"
            className="flex items-center rounded-lg bg-white p-6 shadow"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Upload IFC Model</h3>
              <p className="mt-1 text-sm text-gray-500">Upload a new IFC model file</p>
            </div>
          </Link>

          <Link
            href="/ids-files/upload"
            className="flex items-center rounded-lg bg-white p-6 shadow"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Upload IDS File</h3>
              <p className="mt-1 text-sm text-gray-500">Upload a new IDS specification file</p>
            </div>
          </Link>

          <Link href="/analysis" className="flex items-center rounded-lg bg-white p-6 shadow">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Analyze Model</h3>
              <p className="mt-1 text-sm text-gray-500">Check IFC against IDS specifications</p>
            </div>
          </Link>

          <Link href="/rulebuilder" className="flex items-center rounded-lg bg-white p-6 shadow">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
              <WrenchScrewdriverIcon className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Create Rules</h3>
              <p className="mt-1 text-sm text-gray-500">Open RuleBuilder</p>
            </div>
          </Link>

          <Link href="/rulebook" className="flex items-center rounded-lg bg-white p-6 shadow">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
              <BookOpenIcon className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Manage Rules</h3>
              <p className="mt-1 text-sm text-gray-500">Open RuleBook</p>
            </div>
          </Link>

          <Link href="/lexicon" className="flex items-center rounded-lg bg-white p-6 shadow">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
              <PuzzlePieceIcon className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Manage Profiles</h3>
              <p className="mt-1 text-sm text-gray-500">Open Lexicon</p>
            </div>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
