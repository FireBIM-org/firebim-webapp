import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Layout from '../../components/Layout';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../utils/api-client';

export default function Analysis() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedIdsId, setSelectedIdsId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [processingMethod, setProcessingMethod] = useState<'sync' | 'async'>('async');
  const [checkId, setCheckId] = useState<string>('');
  const [poolingInterval, setPoolingInterval] = useState<NodeJS.Timeout | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (poolingInterval) {
        clearInterval(poolingInterval);
      }
    };
  }, [poolingInterval]);

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
    setResults(null);

    try {
      if (processingMethod === 'async') {
        // Start async processing
        const response = await apiClient.asyncCheckModelWithIds(selectedModelId, selectedIdsId);
        setCheckId(response.check_id);
        
        // Start polling for results
        const interval = setInterval(async () => {
          try {
            const checkResult = await apiClient.getAsyncCheckResult(response.check_id);
            if (checkResult.status === 'completed') {
              setResults(checkResult.result);
              clearInterval(interval);
              setPoolingInterval(null);
              setIsProcessing(false);
              toast.success('Analysis completed!');
            } else if (checkResult.status === 'failed') {
              clearInterval(interval);
              setPoolingInterval(null);
              setIsProcessing(false);
              toast.error('Analysis failed. Please try again.');
            }
          } catch (error) {
            console.error('Error fetching check result:', error);
          }
        }, 2000);
        
        setPoolingInterval(interval);
      } else {
        // Synchronous processing
        const result = await apiClient.syncCheckModelWithIds(selectedModelId, selectedIdsId);
        setResults(result);
        setIsProcessing(false);
        toast.success('Analysis completed!');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to perform analysis. Please try again.');
      setIsProcessing(false);
    }
  };

  const renderResults = () => {
    if (!results) return null;

    return (
      <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Analysis Results</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            IFC model validation against IDS specifications
          </p>
        </div>
        <div className="border-t border-gray-200">
          <dl>
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Total Entities</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {results.total_entities || 0}
              </dd>
            </div>
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Compliant Entities</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {results.compliant_entities || 0}
              </dd>
            </div>
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Non-compliant Entities</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {results.non_compliant_entities || 0}
              </dd>
            </div>
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Compliance Rate</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {((results.compliant_entities / results.total_entities) * 100).toFixed(2)}%
              </dd>
            </div>
          </dl>
        </div>

        {results.issues && results.issues.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg leading-6 font-medium text-gray-900 px-4 py-5 sm:px-6">
              Compliance Issues
            </h3>
            <div className="overflow-hidden overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entity ID
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entity Type
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Issue
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.issues.map((issue: any, index: number) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {issue.entity_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {issue.entity_type}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {issue.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
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
                    models.map((model) => (
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
                    idsFiles.map((idsFile) => (
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
                ? 'Analysis in progress. This might take a few minutes for large models.' 
                : 'Processing your request...'}
            </p>
            {checkId && (
              <p className="text-sm text-gray-500 mt-2">Check ID: {checkId}</p>
            )}
          </div>
        </div>
      )}

      {renderResults()}
    </Layout>
  );
}