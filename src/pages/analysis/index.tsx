import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

import Layout from '../../components/Layout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import apiClient, { IFCModel, IDSFile } from '../../utils/api-client';

export default function Analysis() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedIdsId, setSelectedIdsId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMethod, setProcessingMethod] = useState<'sync' | 'async'>('sync');
  const [checkId, setCheckId] = useState<string>('');

  // Check query parameters for pre-selected model and/or ids
  useEffect(() => {
    if (router.query.model) {
      setSelectedModelId(router.query.model as string);
    }
    if (router.query.ids) {
      setSelectedIdsId(router.query.ids as string);
    }
  }, [router.query]);

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

  const startAnalysis = async () => {
    if (!selectedModelId || !selectedIdsId) {
      toast.error('Please select both an IFC model and an IDS file');
      return;
    }

    setIsProcessing(true);

    try {
      if (processingMethod === 'async') {
        // Start async processing
        const response = await apiClient.asyncCheckModelWithIds(selectedModelId, selectedIdsId);
        setCheckId(response.check_id);

        // Navigate to results page with checkId
        router.push(`/analysis/results?checkId=${response.check_id}`);
      } else {
        // For synchronous processing, navigate to results with modelId and idsId
        router.push(`/analysis/results?modelId=${selectedModelId}&idsId=${selectedIdsId}`);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to perform analysis. Please try again.');
      setIsProcessing(false);
    }
  };

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <LoadingSpinner />
      </Layout>
    );
  }

  return (
    <Layout title="Analysis | FireBIM">
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Model Analysis</h1>
        <p className="mt-1 text-sm text-gray-500">Analyze IFC models against IDS specifications</p>
      </div>

      <div className="mt-5 md:mt-0">
        <div className="shadow sm:rounded-md">
          <div className="bg-white px-4 py-5 sm:p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-700">
                  Select IFC Model
                </label>
                <select
                  id="model"
                  name="model"
                  className="mt-1 block w-full rounded-md border-gray-300 py-2 pr-10 pl-3 text-base focus:border-orange-500 focus:ring-orange-500 focus:outline-none sm:text-sm"
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                >
                  <option value="">Select a model</option>
                  {modelsLoading ? (
                    <option>Loading models...</option>
                  ) : models && models.length > 0 ? (
                    models.map((model: IFCModel) => (
                      <option key={model.id} value={model.id}>
                        {model.filename}
                      </option>
                    ))
                  ) : (
                    <option>No models available</option>
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="ids" className="block text-sm font-medium text-gray-700">
                  Select IDS Specification
                </label>
                <select
                  id="ids"
                  name="ids"
                  className="mt-1 block w-full rounded-md border-gray-300 py-2 pr-10 pl-3 text-base focus:border-orange-500 focus:ring-orange-500 focus:outline-none sm:text-sm"
                  value={selectedIdsId}
                  onChange={(e) => setSelectedIdsId(e.target.value)}
                >
                  <option value="">Select an IDS file</option>
                  {idsLoading ? (
                    <option>Loading IDS files...</option>
                  ) : idsFiles && idsFiles.length > 0 ? (
                    idsFiles.map((idsFile: IDSFile) => (
                      <option key={idsFile.id} value={idsFile.id}>
                        {idsFile.filename}
                      </option>
                    ))
                  ) : (
                    <option>No IDS files available</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Processing Method</label>
                <div className="mt-2">
                  <div className="flex items-center">
                    <input
                      id="sync"
                      name="processing-method"
                      type="radio"
                      className="h-4 w-4 border-gray-300 text-orange-600 focus:ring-orange-500"
                      checked={processingMethod === 'sync'}
                      onChange={() => setProcessingMethod('sync')}
                    />
                    <label htmlFor="sync" className="ml-3 block text-sm font-medium text-gray-700">
                      Synchronous (faster for small files)
                    </label>
                  </div>
                  {/* TODO: Enable this option and make async submission work */}
                  <div className="mt-2 flex items-center">
                    <input
                      id="async"
                      name="processing-method"
                      type="radio"
                      disabled={true}
                      className="h-4 w-4 border-gray-300 text-orange-600 focus:ring-orange-500"
                      checked={processingMethod === 'async'}
                      onChange={() => setProcessingMethod('async')}
                    />
                    <label htmlFor="async" className="ml-3 block text-sm font-medium text-gray-400">
                      Asynchronous (recommended for large files)
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 text-right sm:px-6">
            <button
              type="button"
              onClick={startAnalysis}
              disabled={isProcessing || !selectedModelId || !selectedIdsId}
              className={`inline-flex justify-center rounded-md border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none ${
                isProcessing || !selectedModelId || !selectedIdsId
                  ? 'cursor-not-allowed opacity-70'
                  : ''
              }`}
            >
              {isProcessing ? 'Processing...' : 'Start Analysis'}
            </button>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="mt-8 overflow-hidden bg-white p-4 shadow sm:rounded-lg">
          <div className="flex flex-col items-center justify-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-orange-500"></div>
            <p className="text-gray-700">
              {processingMethod === 'async'
                ? 'Analysis in progress. Redirecting to results page...'
                : 'Processing your request...'}
            </p>
            {checkId && <p className="mt-2 text-sm text-gray-500">Check ID: {checkId}</p>}
          </div>
        </div>
      )}
    </Layout>
  );
}
