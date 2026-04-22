import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import FileInfo from '../../components/FileInfo';
import IFCViewer from '../../components/IFCViewer';
import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ModelAnalysisTable from '../../components/ModelAnalysisTable';
import PrimaryButton from '../../components/PrimaryButton';
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
    isError,
  } = useQuery({
    queryKey: ['model', id],
    queryFn: () => apiClient.getModel(id as string),
    enabled: !!user && !!id,
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
        <LoadingSpinner />
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout title="Error | FireBIM">
        <div className="overflow-hidden bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Error Loading Model</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>
                Could not load the model details. It may have been deleted or you may not have
                permission to view it.
              </p>
            </div>
            <div className="mt-5">
              <Link
                href="/ifc-models"
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none"
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
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title={`Model: ${model.filename} | FireBIM`}>
      <div className="mb-6 md:flex md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-center">
          <Link
            href="/ifc-models"
            className="mr-3 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="Back to Models"
          >
            <ChevronLeftIcon className="h-6 w-6" aria-hidden="true" />
          </Link>
          <h2 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl">
            {model.filename}
          </h2>
        </div>
        <div className="mt-4 flex flex-shrink-0 md:mt-0 md:ml-4">
          <PrimaryButton
            onClick={() => router.push(`/analysis?model=${model.id}`)}
            className="ml-3"
          >
            Analyze Model
          </PrimaryButton>
          <button
            type="button"
            onClick={handleDownload}
            className="ml-3 inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
            disabled={isDownloading}
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <IFCViewer modelId={id as string} />
        </div>
        <div>
          <FileInfo
            title="Model Information"
            description="Details about your IFC model"
            fields={[
              { label: 'Filename', value: model.filename },
              { label: 'File ID', value: model.id },
              {
                label: 'Size',
                value: model.size ? `${Math.round(model.size / 1024)} KB` : 'Unknown',
              },
              {
                label: 'Uploaded',
                value: `${new Date(model.created_at).toLocaleDateString()} ${new Date(model.created_at).toLocaleTimeString()}`,
              },
              ...(model.schema_version
                ? [{ label: 'IFC Schema Version', value: model.schema_version }]
                : []),
              ...(model.entity_count ? [{ label: 'Entity Count', value: model.entity_count }] : []),
            ]}
          />
          <ModelAnalysisTable />
        </div>
      </div>
    </Layout>
  );
}
