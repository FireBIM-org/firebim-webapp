import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Layout from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';
import apiClient, { IFCModel, IDSFile } from '../../utils/api-client';

export default function Analysis() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedIdsId, setSelectedIdsId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMethod, setProcessingMethod] = useState<'sync' | 'async'>('async');
  const [checkId, setCheckId] = useState<string>('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

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
  const { 
    data: models, 
    isLoading: modelsLoading 
  } = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.getModels(),
    enabled: !!user
  });

  // Fetch user's IDS files
  const { 
    data: idsFiles, 
    isLoading: idsLoading 
  } = useQuery({
    queryKey: ['ids-files'],
    queryFn: () => apiClient.getIdsFiles(),
    enabled: !!user
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
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Analysis | FireBIM">
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Model Analysis</h1>
        <p className="mt-1 text-sm text-gray-500">
          Analyze IFC models against IDS specifications
        </p>
      </div>

      <div className="mt-5 md:mt-0">
        <div className="shadow sm:rounded-md">
          <div className="px-4 py-5 bg-white sm:p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-700">
                  Select IFC Model
                </label>
                <select
                  id="model"
                  name="model"
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm rounded-md"
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
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-orange-500 focus:border-orange-500 sm:text-sm rounded-md"
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
                <label className="block text-sm font-medium text-gray-700">
                  Processing Method
                </label>
                <div className="mt-2">
                  <div className="flex items-center">
                    <input
                      id="async"
                      name="processing-method"
                      type="radio"
                      className="focus:ring-orange-500 h-4 w-4 text-orange-600 border-gray-300"
                      checked={processingMethod === 'async'}
                      onChange={() => setProcessingMethod('async')}
                    />
                    <label htmlFor="async" className="ml-3 block text-sm font-medium text-gray-700">
                      Asynchronous (recommended for large files)
                    </label>
                  </div>
                  <div className="flex items-center mt-2">
                    <input
                      id="sync"
                      name="processing-method"
                      type="radio"
                      className="focus:ring-orange-500 h-4 w-4 text-orange-600 border-gray-300"
                      checked={processingMethod === 'sync'}
                      onChange={() => setProcessingMethod('sync')}
                    />
                    <label htmlFor="sync" className="ml-3 block text-sm font-medium text-gray-700">
                      Synchronous (faster for small files)
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
            <button
              type="button"
              onClick={startAnalysis}
              disabled={isProcessing || !selectedModelId || !selectedIdsId}
              className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${
                isProcessing || !selectedModelId || !selectedIdsId
                  ? 'opacity-70 cursor-not-allowed'
                  : ''
              }`}
            >
              {isProcessing ? 'Processing...' : 'Start Analysis'}
            </button>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div className="mt-8 p-4 bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mb-4"></div>
            <p className="text-gray-700">
              {processingMethod === 'async' 
                ? 'Analysis in progress. Redirecting to results page...' 
                : 'Processing your request...'}
            </p>
            {checkId && (
              <p className="text-sm text-gray-500 mt-2">Check ID: {checkId}</p>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}