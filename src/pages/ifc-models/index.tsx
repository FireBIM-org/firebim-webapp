import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'react-toastify';

import { ingestionError, rulebookHref } from '@/features/ingestion/status';

import ConfirmDialog from '../../components/ConfirmDialog';
import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import apiClient, { type IFCModel } from '../../utils/api-client';

export default function IfcModels() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const queryClient = useQueryClient();
  const [modelToDelete, setModelToDelete] = useState<{ id: string; filename: string } | null>(null);

  // Fetch user's IFC models
  const {
    data: models,
    isLoading: modelsLoading,
    error: modelsError,
    refetch,
  } = useQuery({
    queryKey: ['models', user?.id],
    queryFn: () => apiClient.getModels(),
    enabled: !!user,
    refetchInterval: (query) =>
      query.state.data?.some(
        (model) =>
          model.ingestion_backend === 'neo' &&
          ['queued', 'running', 'retry_wait'].includes(model.status ?? ''),
      )
        ? 3000
        : false,
  });

  const deleteModelMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteModel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model deleted successfully');
      setModelToDelete(null);
    },
    onError: (error) => {
      console.error('Delete model error:', error);
      toast.error('Failed to delete model');
      setModelToDelete(null);
    },
  });

  const handleDelete = (id: string, filename: string) => {
    setModelToDelete({ id, filename });
  };

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title="IFC Models | FireBIM">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">IFC Models</h1>
          <p className="mt-2 text-sm text-gray-700">A list of all your uploaded IFC models</p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Link
            href="/ifc-models/upload"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none sm:w-auto"
          >
            Upload Model
          </Link>
        </div>
      </div>

      <div className="mt-8 flex flex-col">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="ring-opacity-5 overflow-hidden shadow ring-1 ring-black md:rounded-lg">
              {modelsError ? (
                <div role="alert" className="bg-red-50 p-4 text-sm text-red-700">
                  Could not load your models: {ingestionError(modelsError)}{' '}
                  <button type="button" onClick={() => void refetch()} className="underline">
                    Try again
                  </button>
                </div>
              ) : modelsLoading ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : !models || models.length === 0 ? (
                <div className="bg-white px-4 py-12 text-center">
                  <p className="text-gray-500">No IFC models found. Upload your first model!</p>
                  <div className="mt-6">
                    <Link
                      href="/ifc-models/upload"
                      className="inline-flex items-center rounded-md border border-transparent bg-orange-100 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-200 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none"
                    >
                      Upload IFC Model
                    </Link>
                  </div>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6"
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
                      <th scope="col" className="relative py-3.5 pr-4 pl-3 sm:pr-6">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {models.map((model: IFCModel) => (
                      <tr key={model.id}>
                        <td className="py-4 pr-3 pl-4 text-sm whitespace-nowrap sm:pl-6">
                          <div className="flex items-center">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
                              <Image
                                src="/file.svg"
                                alt=""
                                className="h-6 w-6"
                                width={24}
                                height={24}
                              />
                            </div>
                            <div className="ml-4">
                              <Link
                                href={`/ifc-models/${model.id}`}
                                className="font-medium text-orange-600 hover:text-orange-900"
                              >
                                {model.filename}
                              </Link>
                              <div className="text-gray-500">ID: {model.id}</div>
                              {model.ingestion_backend === 'neo' && (
                                <div className="text-gray-600">
                                  Translation processing: {model.status ?? 'unknown'} ·{' '}
                                  <Link
                                    href={`/ifc-models/${encodeURIComponent(model.id)}`}
                                    className="text-orange-700 underline"
                                  >
                                    Progress and diagnostics
                                  </Link>
                                </div>
                              )}
                              {model.latest_successful_graph_id && (
                                <Link
                                  href={rulebookHref(model.latest_successful_graph_id)}
                                  className="text-orange-700 underline"
                                >
                                  Open ready graph in Rulebook
                                </Link>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                          {new Date(model.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
                          {model.size ? `${Math.round(model.size / 1024)} KB` : 'N/A'}
                        </td>
                        <td className="relative py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-6">
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              apiClient.downloadModel(model.id);
                            }}
                            className="mr-4 text-orange-600 hover:text-orange-900"
                          >
                            Download<span className="sr-only">, {model.filename}</span>
                          </a>
                          <button
                            onClick={() => handleDelete(model.id, model.filename)}
                            className="text-red-600 hover:text-red-900"
                            disabled={deleteModelMutation.isPending}
                          >
                            Delete<span className="sr-only">, {model.filename}</span>
                          </button>
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

      <ConfirmDialog
        isOpen={!!modelToDelete}
        onClose={() => setModelToDelete(null)}
        onConfirm={() => modelToDelete && deleteModelMutation.mutate(modelToDelete.id)}
        title="Delete Model"
        description={`Delete "${modelToDelete?.filename}"? Access to Neo graph revisions will be revoked and active processing cancelled. Private evidence is retained under the storage retention policy; this is not physical erasure.`}
        isLoading={deleteModelMutation.isPending}
      />
    </Layout>
  );
}
