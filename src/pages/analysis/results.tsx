import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import Layout from '../../components/Layout';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import apiClient from '../../utils/api-client';
import LoadingSpinner from '../../components/LoadingSpinner';
import BackLink from '../../components/BackLink';

interface AnalysisResult {
  title: string;
  date: string;
  filepath: string | null;
  filename: string | null;
  specifications: Specification[];
  status: boolean;
  total_specifications: number;
  total_specifications_pass: number;
  total_specifications_fail: number;
  percent_specifications_pass: number;
  total_requirements: number;
  total_requirements_pass: number;
  total_requirements_fail: number;
  percent_requirements_pass: number;
  total_checks: number;
  total_checks_pass: number;
  total_checks_fail: number;
  percent_checks_pass: number;
}

interface Specification {
  name: string;
  description: string;
  instructions: string;
  status: boolean;
  is_ifc_version: boolean;
  total_applicable: number;
  total_applicable_pass: number;
  total_applicable_fail: number;
  percent_applicable_pass: number;
  total_checks: number;
  total_checks_pass: number;
  total_checks_fail: number;
  percent_checks_pass: number;
  required: boolean;
  applicability: string[];
  requirements: Requirement[];
}

interface Requirement {
  facet_type: string;
  metadata: Record<string, unknown>;
  label: string;
  value: string;
  description: string;
  status: boolean;
  passed_entities: Entity[];
  failed_entities: Entity[];
  total_applicable: number;
  total_pass: number;
  total_fail: number;
  percent_pass: number;
}

interface Entity {
  reason: string;
  element: string;
  element_type: string | null;
  class: string;
  predefined_type: string | null;
  name: string | null;
  description: string | null;
  id: number;
  global_id: string;
  tag: string | null;
}

export default function AnalysisResults() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const router = useRouter();
  const { checkId, modelId, idsId } = router.query;
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'raw'>('summary');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [expandedRequirements, setExpandedRequirements] = useState<Record<string, boolean>>({});

  // Toggle expanded state for a requirement
  const toggleRequirement = (specIndex: number, reqIndex: number) => {
    const key = `${specIndex}-${reqIndex}`;
    setExpandedRequirements(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Check if a requirement is expanded
  const isExpanded = (specIndex: number, reqIndex: number) => {
    const key = `${specIndex}-${reqIndex}`;
    return !!expandedRequirements[key];
  };

  // If we have a checkId from an async check
  const { data: checkResult } = useQuery({
    queryKey: ['async-check-result', checkId],
    queryFn: () => apiClient.getAsyncCheckResult(checkId as string),
    enabled: !!user && !!checkId,
    refetchInterval: 2000,
    refetchIntervalInBackground: true
  });

  // Process async check result
  useEffect(() => {
    if (checkResult) {
      if (checkResult.status === 'completed' && checkResult.result) {
        setAnalysisResult(checkResult.result as unknown as AnalysisResult);
      } else if (checkResult.status === 'failed') {
        toast.error('Analysis failed. Please try again.');
      }
    }
  }, [checkResult]);

  // If we don't have a checkId but have modelId and idsId, perform a sync check
  useEffect(() => {
    const fetchSyncResult = async () => {
      if (!checkId && modelId && idsId) {
        try {
          const result = await apiClient.syncCheckModelWithIds(modelId as string, idsId as string);
          setAnalysisResult(result as unknown as AnalysisResult);
        } catch (error) {
          console.error('Error fetching sync result:', error);
          toast.error('Failed to fetch analysis results');
        }
      }
    };

    if (user && !authLoading) {
      fetchSyncResult();
    }
  }, [user, checkId, modelId, idsId, authLoading]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: boolean) => {
    return status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const getStatusBadge = (status: boolean) => {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
        {status ? 'Passed' : 'Failed'}
      </span>
    );
  };

  const getPercentageColorClass = (percent: number) => {
    if (percent >= 90) return 'text-green-600';
    if (percent >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (authLoading || !user) {
    return (
      <Layout title="Loading... | FireBIM">
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  if (!analysisResult) {
    return (
      <Layout title="Loading Analysis Results | FireBIM">
        <div className="flex flex-col items-center justify-center h-64">
          <LoadingSpinner className="mb-4" />
          <p className="text-gray-700">Loading analysis results...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Analysis Results | FireBIM">
      <div className="py-6">
        <h1 className="text-2xl font-semibold text-gray-900">Analysis Results</h1>
        <p className="mt-1 text-sm text-gray-500">
          {analysisResult?.title || 'IFC model validation results'}
        </p>
      </div>

      {analysisResult && (
        <div className="mt-5 bg-white shadow overflow-hidden sm:rounded-lg">
          {/* Overall Summary Section */}
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-lg leading-6 font-medium text-gray-900">
                {analysisResult.title}
              </h2>
              <div>
                {getStatusBadge(analysisResult.status)}
              </div>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Analysis performed on {formatDate(analysisResult.date)}
            </p>
          </div>

          {/* Tabs Navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                className={`${
                  activeTab === 'summary'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab('summary')}
              >
                Summary
              </button>
              <button
                className={`${
                  activeTab === 'details'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab('details')}
              >
                Detailed Results
              </button>
              <button
                className={`${
                  activeTab === 'raw'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                onClick={() => setActiveTab('raw')}
              >
                Raw JSON
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="px-4 py-5 sm:p-6">
            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Overall Stats Card */}
                  <div className="bg-gray-50 p-4 rounded-md shadow-sm">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Overall Results</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Specifications</span>
                          <span className="text-sm font-medium text-gray-900">{analysisResult.total_specifications_pass}/{analysisResult.total_specifications}</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-orange-600 h-2 rounded-full" 
                            style={{ width: `${analysisResult.percent_specifications_pass}%` }}
                          ></div>
                        </div>
                        <p className={`mt-1 text-xs ${getPercentageColorClass(analysisResult.percent_specifications_pass)}`}>
                          {analysisResult.percent_specifications_pass.toFixed(1)}% passed
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Requirements</span>
                          <span className="text-sm font-medium text-gray-900">{analysisResult.total_requirements_pass}/{analysisResult.total_requirements}</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-orange-600 h-2 rounded-full" 
                            style={{ width: `${analysisResult.percent_requirements_pass}%` }}
                          ></div>
                        </div>
                        <p className={`mt-1 text-xs ${getPercentageColorClass(analysisResult.percent_requirements_pass)}`}>
                          {analysisResult.percent_requirements_pass.toFixed(1)}% passed
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-500">Individual Checks</span>
                          <span className="text-sm font-medium text-gray-900">{analysisResult.total_checks_pass}/{analysisResult.total_checks}</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-orange-600 h-2 rounded-full" 
                            style={{ width: `${analysisResult.percent_checks_pass}%` }}
                          ></div>
                        </div>
                        <p className={`mt-1 text-xs ${getPercentageColorClass(analysisResult.percent_checks_pass)}`}>
                          {analysisResult.percent_checks_pass.toFixed(1)}% passed
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Critical Issues Card */}
                  <div className="bg-gray-50 p-4 rounded-md shadow-sm">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Critical Issues</h3>
                    
                    <div className="space-y-2">
                      {analysisResult.specifications
                        .filter(spec => spec.required && !spec.status)
                        .slice(0, 5)
                        .map((spec, index) => (
                          <div key={index} className="p-2 bg-red-50 border border-red-100 rounded-md">
                            <p className="font-medium text-red-800">{spec.name}</p>
                            <p className="text-sm text-red-700 mt-1">{spec.description || 'No description provided'}</p>
                          </div>
                        ))}
                      
                      {analysisResult.specifications.filter(spec => spec.required && !spec.status).length === 0 && (
                        <p className="text-sm text-gray-700">No critical issues found.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specifications Summary */}
                <div className="mt-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Specifications Summary</h3>
                  
                  <div className="overflow-hidden overflow-x-auto shadow border-b border-gray-200 sm:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Specification
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Pass Rate
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Required
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {analysisResult.specifications.map((spec, index) => (
                          <tr key={index} className={spec.required && !spec.status ? 'bg-red-50' : ''}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {spec.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {getStatusBadge(spec.status)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex items-center">
                                <span className={getPercentageColorClass(
                                  typeof spec.percent_checks_pass === 'number' ? spec.percent_checks_pass : Number(spec.percent_checks_pass)
                                )}>
                                  {typeof spec.percent_checks_pass === 'number' && !isNaN(spec.percent_checks_pass)
                                    ? spec.percent_checks_pass.toFixed(1)
                                    : Number(spec.percent_checks_pass).toFixed(1)}%
                                </span>
                                <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className={`${spec.status ? 'bg-green-600' : 'bg-red-600'} h-2 rounded-full`}
                                    style={{ width: `${typeof spec.percent_checks_pass === 'number' ? spec.percent_checks_pass : Number(spec.percent_checks_pass)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {spec.required ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  Required
                                </span>
                              ) : 'Optional'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Detailed Results Tab */}
            {activeTab === 'details' && (
              <div>
                <div className="space-y-8">
                  {analysisResult.specifications.map((spec, specIndex) => (
                    <div key={specIndex} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                      <div className={`px-4 py-5 ${spec.status ? 'bg-green-50' : 'bg-red-50'} border-b border-gray-200 sm:px-6`}>
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg leading-6 font-medium text-gray-900">
                            {spec.name}
                          </h3>
                          {getStatusBadge(spec.status)}
                        </div>
                        {spec.description && (
                          <p className="mt-1 max-w-2xl text-sm text-gray-500">{spec.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${spec.required ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                            {spec.required ? 'Required' : 'Optional'}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {spec.total_checks} checks
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {Number.isFinite(Number(spec.percent_checks_pass))
                              ? Number(spec.percent_checks_pass).toFixed(1)
                              : '0.0'}% pass rate
                          </span>
                        </div>
                      </div>
                      
                      <div className="px-4 py-5 sm:p-6">
                        <h4 className="text-md font-medium text-gray-700 mb-3">Requirements</h4>
                        <div className="space-y-6">
                          {spec.requirements.map((req, reqIndex) => (
                            <div key={reqIndex} className="border border-gray-200 rounded-md overflow-hidden">
                              <div className={`px-4 py-3 ${req.status ? 'bg-green-50' : 'bg-red-50'} border-b border-gray-200`}>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h5 className="text-sm font-medium text-gray-900">
                                      {req.facet_type}: {req.label}
                                    </h5>
                                    <p className="mt-1 text-xs text-gray-500">{req.description}</p>
                                  </div>
                                  {getStatusBadge(req.status)}
                                </div>
                              </div>
                              
                              {(req.failed_entities && req.failed_entities.length > 0) && (
                                <div className="px-4 py-3">
                                  <button
                                    type="button"
                                    className="flex items-center justify-between w-full text-left"
                                    onClick={() => toggleRequirement(specIndex, reqIndex)}
                                  >
                                    <h6 className="text-xs font-medium text-gray-700">
                                      Failed Entities ({req.failed_entities.length})
                                    </h6>
                                    <span className="text-gray-500">
                                      {isExpanded(specIndex, reqIndex) ? 
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg> :
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      }
                                    </span>
                                  </button>
                                  
                                  {isExpanded(specIndex, reqIndex) && (
                                    <div className="mt-2 overflow-x-auto">
                                      <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                          <tr>
                                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                          </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                          {req.failed_entities.map((entity, entityIndex) => (
                                            <tr key={entityIndex} className="hover:bg-gray-50">
                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{entity.id}</td>
                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{entity.class}</td>
                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{entity.name || '-'}</td>
                                              <td className="px-3 py-2 text-xs text-gray-500">{entity.reason}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON Tab */}
            {activeTab === 'raw' && (
              <div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="overflow-auto text-xs text-gray-800 max-h-[600px]">
                    {JSON.stringify(analysisResult, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-8">
        <BackLink href="/analysis">&larr; Back to Analysis</BackLink>
      </div>
    </Layout>
  );
}