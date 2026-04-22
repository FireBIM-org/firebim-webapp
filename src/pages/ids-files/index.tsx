import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import apiClient, { type IDSFile } from '../../utils/api-client';
import Image from 'next/image';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function IdsFiles() {
  const { user, isLoading: authLoading } = useRequireAuth();

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
    <Layout title="IDS Files | FireBIM">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">IDS Files</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all your uploaded IDS specification files
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Link
            href="/ids-files/upload"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 sm:w-auto"
          >
            Upload IDS File
          </Link>
        </div>
      </div>

      <div className="mt-8 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              {idsLoading ? (
                <div className="py-12 flex justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
                </div>
              ) : !idsFiles || idsFiles.length === 0 ? (
                <div className="bg-white px-4 py-12 text-center">
                  <p className="text-gray-500">
                    No IDS files found. Upload your first IDS specification!
                  </p>
                  <div className="mt-6">
                    <Link
                      href="/ids-files/upload"
                      className="inline-flex items-center rounded-md border border-transparent bg-orange-100 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                    >
                      Upload IDS File
                    </Link>
                  </div>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                      >
                        Uploaded On
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                      >
                        Size
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {idsFiles.map((idsFile: IDSFile) => (
                      <tr key={idsFile.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                          <div className="flex items-center">
                            <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-gray-100 rounded-md">
                              <Image
                                src="/file.svg"
                                alt=""
                                className="h-6 w-6"
                                width={24}
                                height={24}
                              />
                            </div>
                            <div className="ml-4">
                              <div className="font-medium text-gray-900">{idsFile.filename}</div>
                              <div className="text-gray-500">ID: {idsFile.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {new Date(idsFile.created_at).toLocaleDateString()}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {idsFile.size ? `${Math.round(idsFile.size / 1024)} KB` : 'N/A'}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <Link
                            href={`/ids-files/${idsFile.id}`}
                            className="text-orange-600 hover:text-orange-900 mr-4"
                          >
                            View<span className="sr-only">, {idsFile.filename}</span>
                          </Link>
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              apiClient.downloadIdsFile(idsFile.id);
                            }}
                            className="text-orange-600 hover:text-orange-900"
                          >
                            Download<span className="sr-only">, {idsFile.filename}</span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
