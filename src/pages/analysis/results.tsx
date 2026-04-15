import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import React, { useState, useEffect } from 'react'
import { toast } from 'react-toastify'

import BackLink from '../../components/BackLink'
import Layout from '../../components/Layout'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useAuth } from '../../contexts/AuthContext'
import apiClient from '../../utils/api-client'

interface AnalysisResult {
  title: string
  date: string
  filepath: string | null
  filename: string | null
  specifications: Specification[]
  status: boolean
  total_specifications: number
  total_specifications_pass: number
  total_specifications_fail: number
  percent_specifications_pass: number
  total_requirements: number
  total_requirements_pass: number
  total_requirements_fail: number
  percent_requirements_pass: number
  total_checks: number
  total_checks_pass: number
  total_checks_fail: number
  percent_checks_pass: number
}

interface Specification {
  name: string
  description: string
  instructions: string
  status: boolean
  is_ifc_version: boolean
  total_applicable: number
  total_applicable_pass: number
  total_applicable_fail: number
  percent_applicable_pass: number
  total_checks: number
  total_checks_pass: number
  total_checks_fail: number
  percent_checks_pass: number
  required: boolean
  applicability: string[]
  requirements: Requirement[]
}

interface Requirement {
  facet_type: string
  metadata: Record<string, unknown>
  label: string
  value: string
  description: string
  status: boolean
  passed_entities: Entity[]
  failed_entities: Entity[]
  total_applicable: number
  total_pass: number
  total_fail: number
  percent_pass: number
}

interface Entity {
  reason: string
  element: string
  element_type: string | null
  class: string
  predefined_type: string | null
  name: string | null
  description: string | null
  id: number
  global_id: string
  tag: string | null
}

export default function AnalysisResults() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { checkId, modelId, idsId } = router.query
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'raw'>('summary')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [expandedRequirements, setExpandedRequirements] = useState<Record<string, boolean>>({})

  // Toggle expanded state for a requirement
  const toggleRequirement = (specIndex: number, reqIndex: number) => {
    const key = `${specIndex}-${reqIndex}`
    setExpandedRequirements((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Check if a requirement is expanded
  const isExpanded = (specIndex: number, reqIndex: number) => {
    const key = `${specIndex}-${reqIndex}`
    return !!expandedRequirements[key]
  }

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, user, router])

  // If we have a checkId from an async check
  const { data: checkResult } = useQuery({
    queryKey: ['async-check-result', checkId],
    queryFn: () => apiClient.getAsyncCheckResult(checkId as string),
    enabled: !!user && !!checkId,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  })

  // Process async check result
  useEffect(() => {
    if (checkResult) {
      if (checkResult.status === 'completed' && checkResult.result) {
        setAnalysisResult(checkResult.result as unknown as AnalysisResult)
      } else if (checkResult.status === 'failed') {
        toast.error('Analysis failed. Please try again.')
      }
    }
  }, [checkResult])

  // If we don't have a checkId but have modelId and idsId, perform a sync check
  useEffect(() => {
    const fetchSyncResult = async () => {
      if (!checkId && modelId && idsId) {
        try {
          const result = await apiClient.syncCheckModelWithIds(modelId as string, idsId as string)
          setAnalysisResult(result as unknown as AnalysisResult)
        } catch (error) {
          console.error('Error fetching sync result:', error)
          toast.error('Failed to fetch analysis results')
        }
      }
    }

    if (user && !authLoading) {
      fetchSyncResult()
    }
  }, [user, checkId, modelId, idsId, authLoading])

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString()
    } catch {
      return dateString
    }
  }

  const getStatusColor = (status: boolean) => {
    return status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  }

  const getStatusBadge = (status: boolean) => {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(status)}`}
      >
        {status ? 'Passed' : 'Failed'}
      </span>
    )
  }

  const getPercentageColorClass = (percent: number) => {
    if (percent >= 90) return 'text-green-600'
    if (percent >= 75) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (authLoading || !user) {
    return (
      <Layout title='Loading... | FireBIM'>
        <div className='flex h-64 items-center justify-center'>
          <LoadingSpinner />
        </div>
      </Layout>
    )
  }

  if (!analysisResult) {
    return (
      <Layout title='Loading Analysis Results | FireBIM'>
        <div className='flex h-64 flex-col items-center justify-center'>
          <LoadingSpinner className='mb-4' />
          <p className='text-gray-700'>Loading analysis results...</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title='Analysis Results | FireBIM'>
      <div className='py-6'>
        <h1 className='text-2xl font-semibold text-gray-900'>Analysis Results</h1>
        <p className='mt-1 text-sm text-gray-500'>{analysisResult?.title || 'IFC model validation results'}</p>
      </div>

      {analysisResult && (
        <div className='mt-5 overflow-hidden bg-white shadow sm:rounded-lg'>
          {/* Overall Summary Section */}
          <div className='border-b border-gray-200 px-4 py-5 sm:px-6'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg leading-6 font-medium text-gray-900'>{analysisResult.title}</h2>
              <div>{getStatusBadge(analysisResult.status)}</div>
            </div>
            <p className='mt-1 max-w-2xl text-sm text-gray-500'>
              Analysis performed on {formatDate(analysisResult.date)}
            </p>
          </div>

          {/* Tabs Navigation */}
          <div className='border-b border-gray-200'>
            <nav className='-mb-px flex'>
              <button
                className={`${
                  activeTab === 'summary'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } border-b-2 px-6 py-4 text-sm font-medium whitespace-nowrap`}
                onClick={() => setActiveTab('summary')}
              >
                Summary
              </button>
              <button
                className={`${
                  activeTab === 'details'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } border-b-2 px-6 py-4 text-sm font-medium whitespace-nowrap`}
                onClick={() => setActiveTab('details')}
              >
                Detailed Results
              </button>
              <button
                className={`${
                  activeTab === 'raw'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } border-b-2 px-6 py-4 text-sm font-medium whitespace-nowrap`}
                onClick={() => setActiveTab('raw')}
              >
                Raw JSON
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className='px-4 py-5 sm:p-6'>
            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div>
                <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                  {/* Overall Stats Card */}
                  <div className='rounded-md bg-gray-50 p-4 shadow-sm'>
                    <h3 className='mb-4 text-lg font-medium text-gray-900'>Overall Results</h3>

                    <div className='space-y-4'>
                      <div>
                        <div className='flex items-center justify-between'>
                          <span className='text-sm font-medium text-gray-500'>Specifications</span>
                          <span className='text-sm font-medium text-gray-900'>
                            {analysisResult.total_specifications_pass}/{analysisResult.total_specifications}
                          </span>
                        </div>
                        <div className='mt-1 h-2 w-full rounded-full bg-gray-200'>
                          <div
                            className='h-2 rounded-full bg-orange-600'
                            style={{ width: `${analysisResult.percent_specifications_pass}%` }}
                          ></div>
                        </div>
                        <p
                          className={`mt-1 text-xs ${getPercentageColorClass(analysisResult.percent_specifications_pass)}`}
                        >
                          {analysisResult.percent_specifications_pass.toFixed(1)}% passed
                        </p>
                      </div>

                      <div>
                        <div className='flex items-center justify-between'>
                          <span className='text-sm font-medium text-gray-500'>Requirements</span>
                          <span className='text-sm font-medium text-gray-900'>
                            {analysisResult.total_requirements_pass}/{analysisResult.total_requirements}
                          </span>
                        </div>
                        <div className='mt-1 h-2 w-full rounded-full bg-gray-200'>
                          <div
                            className='h-2 rounded-full bg-orange-600'
                            style={{ width: `${analysisResult.percent_requirements_pass}%` }}
                          ></div>
                        </div>
                        <p
                          className={`mt-1 text-xs ${getPercentageColorClass(analysisResult.percent_requirements_pass)}`}
                        >
                          {analysisResult.percent_requirements_pass.toFixed(1)}% passed
                        </p>
                      </div>

                      <div>
                        <div className='flex items-center justify-between'>
                          <span className='text-sm font-medium text-gray-500'>Individual Checks</span>
                          <span className='text-sm font-medium text-gray-900'>
                            {analysisResult.total_checks_pass}/{analysisResult.total_checks}
                          </span>
                        </div>
                        <div className='mt-1 h-2 w-full rounded-full bg-gray-200'>
                          <div
                            className='h-2 rounded-full bg-orange-600'
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
                  <div className='rounded-md bg-gray-50 p-4 shadow-sm'>
                    <h3 className='mb-4 text-lg font-medium text-gray-900'>Critical Issues</h3>

                    <div className='space-y-2'>
                      {analysisResult.specifications
                        .filter((spec) => spec.required && !spec.status)
                        .slice(0, 5)
                        .map((spec, index) => (
                          <div key={index} className='rounded-md border border-red-100 bg-red-50 p-2'>
                            <p className='font-medium text-red-800'>{spec.name}</p>
                            <p className='mt-1 text-sm text-red-700'>{spec.description || 'No description provided'}</p>
                          </div>
                        ))}

                      {analysisResult.specifications.filter((spec) => spec.required && !spec.status).length === 0 && (
                        <p className='text-sm text-gray-700'>No critical issues found.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specifications Summary */}
                <div className='mt-8'>
                  <h3 className='mb-4 text-lg font-medium text-gray-900'>Specifications Summary</h3>

                  <div className='overflow-hidden overflow-x-auto border-b border-gray-200 shadow sm:rounded-lg'>
                    <table className='min-w-full divide-y divide-gray-200'>
                      <thead className='bg-gray-50'>
                        <tr>
                          <th
                            scope='col'
                            className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                          >
                            Specification
                          </th>
                          <th
                            scope='col'
                            className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                          >
                            Status
                          </th>
                          <th
                            scope='col'
                            className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                          >
                            Pass Rate
                          </th>
                          <th
                            scope='col'
                            className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                          >
                            Required
                          </th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-gray-200 bg-white'>
                        {analysisResult.specifications.map((spec, index) => (
                          <tr key={index} className={spec.required && !spec.status ? 'bg-red-50' : ''}>
                            <td className='px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900'>
                              {spec.name}
                            </td>
                            <td className='px-6 py-4 text-sm whitespace-nowrap text-gray-500'>
                              {getStatusBadge(spec.status)}
                            </td>
                            <td className='px-6 py-4 text-sm whitespace-nowrap text-gray-500'>
                              <div className='flex items-center'>
                                <span
                                  className={getPercentageColorClass(
                                    typeof spec.percent_checks_pass === 'number'
                                      ? spec.percent_checks_pass
                                      : Number(spec.percent_checks_pass)
                                  )}
                                >
                                  {typeof spec.percent_checks_pass === 'number' && !isNaN(spec.percent_checks_pass)
                                    ? spec.percent_checks_pass.toFixed(1)
                                    : Number(spec.percent_checks_pass).toFixed(1)}
                                  %
                                </span>
                                <div className='ml-2 h-2 w-16 rounded-full bg-gray-200'>
                                  <div
                                    className={`${spec.status ? 'bg-green-600' : 'bg-red-600'} h-2 rounded-full`}
                                    style={{
                                      width: `${typeof spec.percent_checks_pass === 'number' ? spec.percent_checks_pass : Number(spec.percent_checks_pass)}%`,
                                    }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className='px-6 py-4 text-sm whitespace-nowrap text-gray-500'>
                              {spec.required ? (
                                <span className='inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800'>
                                  Required
                                </span>
                              ) : (
                                'Optional'
                              )}
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
                <div className='space-y-8'>
                  {analysisResult.specifications.map((spec, specIndex) => (
                    <div
                      key={specIndex}
                      className='overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm'
                    >
                      <div
                        className={`px-4 py-5 ${spec.status ? 'bg-green-50' : 'bg-red-50'} border-b border-gray-200 sm:px-6`}
                      >
                        <div className='flex items-center justify-between'>
                          <h3 className='text-lg leading-6 font-medium text-gray-900'>{spec.name}</h3>
                          {getStatusBadge(spec.status)}
                        </div>
                        {spec.description && <p className='mt-1 max-w-2xl text-sm text-gray-500'>{spec.description}</p>}
                        <div className='mt-2 flex flex-wrap gap-2'>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${spec.required ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}
                          >
                            {spec.required ? 'Required' : 'Optional'}
                          </span>
                          <span className='inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800'>
                            {spec.total_checks} checks
                          </span>
                          <span className='inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800'>
                            {Number.isFinite(Number(spec.percent_checks_pass))
                              ? Number(spec.percent_checks_pass).toFixed(1)
                              : '0.0'}
                            % pass rate
                          </span>
                        </div>
                      </div>

                      <div className='px-4 py-5 sm:p-6'>
                        <h4 className='text-md mb-3 font-medium text-gray-700'>Requirements</h4>
                        <div className='space-y-6'>
                          {spec.requirements.map((req, reqIndex) => (
                            <div key={reqIndex} className='overflow-hidden rounded-md border border-gray-200'>
                              <div
                                className={`px-4 py-3 ${req.status ? 'bg-green-50' : 'bg-red-50'} border-b border-gray-200`}
                              >
                                <div className='flex items-center justify-between'>
                                  <div>
                                    <h5 className='text-sm font-medium text-gray-900'>
                                      {req.facet_type}: {req.label}
                                    </h5>
                                    <p className='mt-1 text-xs text-gray-500'>{req.description}</p>
                                  </div>
                                  {getStatusBadge(req.status)}
                                </div>
                              </div>

                              {req.failed_entities && req.failed_entities.length > 0 && (
                                <div className='px-4 py-3'>
                                  <button
                                    type='button'
                                    className='flex w-full items-center justify-between text-left'
                                    onClick={() => toggleRequirement(specIndex, reqIndex)}
                                  >
                                    <h6 className='text-xs font-medium text-gray-700'>
                                      Failed Entities ({req.failed_entities.length})
                                    </h6>
                                    <span className='text-gray-500'>
                                      {isExpanded(specIndex, reqIndex) ? (
                                        <svg
                                          xmlns='http://www.w3.org/2000/svg'
                                          className='h-4 w-4'
                                          fill='none'
                                          viewBox='0 0 24 24'
                                          stroke='currentColor'
                                        >
                                          <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            strokeWidth={2}
                                            d='M5 15l7-7 7 7'
                                          />
                                        </svg>
                                      ) : (
                                        <svg
                                          xmlns='http://www.w3.org/2000/svg'
                                          className='h-4 w-4'
                                          fill='none'
                                          viewBox='0 0 24 24'
                                          stroke='currentColor'
                                        >
                                          <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            strokeWidth={2}
                                            d='M19 9l-7 7-7-7'
                                          />
                                        </svg>
                                      )}
                                    </span>
                                  </button>

                                  {isExpanded(specIndex, reqIndex) && (
                                    <div className='mt-2 overflow-x-auto'>
                                      <table className='min-w-full divide-y divide-gray-200'>
                                        <thead className='bg-gray-50'>
                                          <tr>
                                            <th
                                              scope='col'
                                              className='px-3 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                                            >
                                              ID
                                            </th>
                                            <th
                                              scope='col'
                                              className='px-3 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                                            >
                                              Class
                                            </th>
                                            <th
                                              scope='col'
                                              className='px-3 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                                            >
                                              Name
                                            </th>
                                            <th
                                              scope='col'
                                              className='px-3 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                                            >
                                              Reason
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className='divide-y divide-gray-200 bg-white'>
                                          {req.failed_entities.map((entity, entityIndex) => (
                                            <tr key={entityIndex} className='hover:bg-gray-50'>
                                              <td className='px-3 py-2 text-xs whitespace-nowrap text-gray-500'>
                                                {entity.id}
                                              </td>
                                              <td className='px-3 py-2 text-xs whitespace-nowrap text-gray-500'>
                                                {entity.class}
                                              </td>
                                              <td className='px-3 py-2 text-xs whitespace-nowrap text-gray-500'>
                                                {entity.name || '-'}
                                              </td>
                                              <td className='px-3 py-2 text-xs text-gray-500'>{entity.reason}</td>
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
                <div className='rounded-lg bg-gray-50 p-4'>
                  <pre className='max-h-[600px] overflow-auto text-xs text-gray-800'>
                    {JSON.stringify(analysisResult, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className='mt-8'>
        <BackLink href='/analysis'>&larr; Back to Analysis</BackLink>
      </div>
    </Layout>
  )
}
