import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Layout from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../utils/api-client';

export default function IdsFileDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch IDS file details
  const { 
    data: idsFile, 
    isLoading: idsLoading,
    isError
  } = useQuery({
    queryKey: ['ids-file', id],
    queryFn: () => apiClient.getIdsFile(id as string),
    enabled: !!user && !!id
  });

  const handleDownload = async () => {
    try {
      await apiClient.downloadIdsFile(id as string);
      toast.success('IDS file download started');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download IDS file');
    }
  };

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout title="Error | FireBIM">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Error Loading IDS File</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Could not load the IDS file details. It may have been deleted or you may not have permission to view it.</p>
            </div>
            <div className="mt-5">
              <Link
                href="/ids-files"
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
              >
                Back to IDS Files
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (idsLoading || !idsFile) {
    return (
      <Layout title="Loading IDS File... | FireBIM">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`IDS File: ${idsFile.filename} | FireBIM`}>
      <div className="max-w-3xl mx-auto">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {idsFile.filename}
            </h2>
          </div>
          <div className="mt-4 flex-shrink-0 flex md:mt-0 md:ml-4">
            <button
              type="button"
              onClick={() => router.push(`/analysis?ids=${idsFile.id}`)}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Use for Analysis
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Download
            </button>
          </div>
        </div>

        <div className="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              IDS File Information
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Details about your Information Delivery Specification file
            </p>
          </div>
          <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Filename</dt>
                <dd className="mt-1 text-sm text-gray-900">{idsFile.filename}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">File ID</dt>
                <dd className="mt-1 text-sm text-gray-900">{idsFile.id}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Size</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {idsFile.size ? `${Math.round(idsFile.size / 1024)} KB` : 'Unknown'}
                </dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Uploaded</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(idsFile.created_at).toLocaleDateString()} {new Date(idsFile.created_at).toLocaleTimeString()}
                </dd>
              </div>
              {idsFile.specification_version && (
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">IDS Version</dt>
                  <dd className="mt-1 text-sm text-gray-900">{idsFile.specification_version}</dd>
                </div>
              )}
              {idsFile.rule_count && (
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Rule Count</dt>
                  <dd className="mt-1 text-sm text-gray-900">{idsFile.rule_count}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {idsFile.specifications && (
          <div className="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Specifications
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Rules and requirements defined in this IDS file
              </p>
            </div>
            <div className="border-t border-gray-200">
              <div className="px-4 py-5 sm:p-6">
                <div className="overflow-hidden overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Property
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Requirement
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {idsFile.specifications.map((spec: any, index: number) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {spec.entity_type || 'Any'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {spec.property || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {spec.requirement || 'Required'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <Link
            href="/ids-files"
            className="text-orange-600 hover:text-orange-900"
          >
            &larr; Back to IDS Files
          </Link>
        </div>
      </div>
    </Layout>
  );
}