import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Layout from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../utils/api-client';

export default function ModelDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const [isDownloading, setIsDownloading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch model details
  const { 
    data: model, 
    isLoading: modelLoading,
    isError
  } = useQuery({
    queryKey: ['model', id],
    queryFn: () => apiClient.getModel(id as string),
    enabled: !!user && !!id
  });

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      console.log(`Initiating download for model: ${id}`);
      const blob = await apiClient.downloadModel(id as string);
      
      // Determine the correct MIME type for IFC files
      const mimeType = 'application/ifc';
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
      
      // Create a temporary anchor element and trigger the download
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      // Add null check to prevent TypeScript error
      a.download = model?.filename || `model-${id}.ifc`;
      
      // Need to append to the document
      document.body.appendChild(a);
      
      // Trigger the download
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('Download started');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download model. Please try again.');
    } finally {
      setIsDownloading(false);
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
            <h3 className="text-lg leading-6 font-medium text-gray-900">Error Loading Model</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Could not load the model details. It may have been deleted or you may not have permission to view it.</p>
            </div>
            <div className="mt-5">
              <Link
                href="/ifc-models"
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
              >
                Back to Models
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (modelLoading || !model) {
    return (
      <Layout title="Loading Model... | FireBIM">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Model: ${model.filename} | FireBIM`}>
      <div className="max-w-3xl mx-auto">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
              {model.filename}
            </h2>
          </div>
          <div className="mt-4 flex-shrink-0 flex md:mt-0 md:ml-4">
            <button
              type="button"
              onClick={() => router.push(`/analysis?model=${model.id}`)}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Analyze Model
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              disabled={isDownloading}
            >
              {isDownloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        </div>

        <div className="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Model Information
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Details about your IFC model
            </p>
          </div>
          <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Filename</dt>
                <dd className="mt-1 text-sm text-gray-900">{model.filename}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">File ID</dt>
                <dd className="mt-1 text-sm text-gray-900">{model.id}</dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Size</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {model.size ? `${Math.round(model.size / 1024)} KB` : 'Unknown'}
                </dd>
              </div>
              <div className="sm:col-span-1">
                <dt className="text-sm font-medium text-gray-500">Uploaded</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(model.created_at).toLocaleDateString()} {new Date(model.created_at).toLocaleTimeString()}
                </dd>
              </div>
              {model.schema_version && (
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">IFC Schema Version</dt>
                  <dd className="mt-1 text-sm text-gray-900">{model.schema_version}</dd>
                </div>
              )}
              {model.entity_count && (
                <div className="sm:col-span-1">
                  <dt className="text-sm font-medium text-gray-500">Entity Count</dt>
                  <dd className="mt-1 text-sm text-gray-900">{model.entity_count}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="mt-8">
          <Link
            href="/ifc-models"
            className="text-orange-600 hover:text-orange-900"
          >
            &larr; Back to Models
          </Link>
        </div>
      </div>
    </Layout>
  );
}