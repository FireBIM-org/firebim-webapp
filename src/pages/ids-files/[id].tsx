import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'

import BackLink from '../../components/BackLink'
import FileInfo from '../../components/FileInfo'
import Layout from '../../components/Layout'
import LoadingSpinner from '../../components/LoadingSpinner'
import PrimaryButton from '../../components/PrimaryButton'
import { useAuth } from '../../contexts/AuthContext'
import apiClient, { IDSSpecification } from '../../utils/api-client'

export default function IdsFileDetail() {
  const router = useRouter()
  const { id } = router.query
  const { user, isLoading: authLoading } = useAuth()
  const [isDownloading, setIsDownloading] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, user, router])

  // Fetch IDS file details
  const {
    data: idsFile,
    isLoading: idsLoading,
    isError,
  } = useQuery({
    queryKey: ['ids-file', id],
    queryFn: () => apiClient.getIdsFile(id as string),
    enabled: !!user && !!id,
  })

  const handleDownload = async () => {
    try {
      setIsDownloading(true)
      console.log(`Initiating download for IDS file: ${id}`)
      const blob = await apiClient.downloadIdsFile(id as string)

      // Determine the correct MIME type for IDS/XML files
      const mimeType = 'application/xml'

      // Create a URL for the blob
      const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }))

      // Create a temporary anchor element and trigger the download
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      // Add null check to prevent TypeScript error
      a.download = idsFile?.filename || `ids-${id}.ids`

      // Need to append to the document
      document.body.appendChild(a)

      // Trigger the download
      a.click()

      // Clean up
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success('Download started')
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Failed to download IDS file. Please try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  if (authLoading || !user) {
    return (
      <Layout title='Loading... | FireBIM'>
        <LoadingSpinner />
      </Layout>
    )
  }

  if (isError) {
    return (
      <Layout title='Error | FireBIM'>
        <div className='overflow-hidden bg-white shadow sm:rounded-lg'>
          <div className='px-4 py-5 sm:p-6'>
            <h3 className='text-lg leading-6 font-medium text-gray-900'>Error Loading IDS File</h3>
            <div className='mt-2 max-w-xl text-sm text-gray-500'>
              <p>
                Could not load the IDS file details. It may have been deleted or you may not have permission to view it.
              </p>
            </div>
            <div className='mt-5'>
              <Link
                href='/ids-files'
                className='inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none'
              >
                Back to IDS Files
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (idsLoading || !idsFile) {
    return (
      <Layout title='Loading IDS File... | FireBIM'>
        <LoadingSpinner />
      </Layout>
    )
  }

  return (
    <Layout title={`IDS File: ${idsFile.filename} | FireBIM`}>
      <div className='mx-auto max-w-3xl'>
        <div className='md:flex md:items-center md:justify-between'>
          <div className='min-w-0 flex-1'>
            <h2 className='text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl'>{idsFile.filename}</h2>
          </div>
          <div className='mt-4 flex flex-shrink-0 md:mt-0 md:ml-4'>
            <PrimaryButton onClick={() => router.push(`/analysis?ids=${idsFile.id}`)} className='ml-3'>
              Use for Analysis
            </PrimaryButton>
            <button
              type='button'
              onClick={handleDownload}
              className='ml-3 inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none'
              disabled={isDownloading}
            >
              {isDownloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        </div>

        <FileInfo
          title='IDS File Information'
          description='Details about your Information Delivery Specification file'
          fields={[
            { label: 'Filename', value: idsFile.filename },
            { label: 'File ID', value: idsFile.id },
            { label: 'Size', value: idsFile.size ? `${Math.round(idsFile.size / 1024)} KB` : 'Unknown' },
            {
              label: 'Uploaded',
              value: `${new Date(idsFile.created_at).toLocaleDateString()} ${new Date(idsFile.created_at).toLocaleTimeString()}`,
            },
            ...(idsFile.specification_version ? [{ label: 'IDS Version', value: idsFile.specification_version }] : []),
            ...(idsFile.rule_count ? [{ label: 'Rule Count', value: idsFile.rule_count }] : []),
          ]}
        />

        {idsFile.specifications && (
          <div className='mt-6 overflow-hidden bg-white shadow sm:rounded-lg'>
            <div className='px-4 py-5 sm:px-6'>
              <h3 className='text-lg leading-6 font-medium text-gray-900'>Specifications</h3>
              <p className='mt-1 max-w-2xl text-sm text-gray-500'>Rules and requirements defined in this IDS file</p>
            </div>
            <div className='border-t border-gray-200'>
              <div className='px-4 py-5 sm:p-6'>
                <div className='overflow-hidden overflow-x-auto'>
                  <table className='min-w-full divide-y divide-gray-200'>
                    <thead className='bg-gray-50'>
                      <tr>
                        <th
                          scope='col'
                          className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                        >
                          Type
                        </th>
                        <th
                          scope='col'
                          className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                        >
                          Property
                        </th>
                        <th
                          scope='col'
                          className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
                        >
                          Requirement
                        </th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-200 bg-white'>
                      {idsFile.specifications.map((spec: IDSSpecification, index: number) => (
                        <tr key={index}>
                          <td className='px-6 py-4 text-sm whitespace-nowrap text-gray-500'>
                            {spec.entity_type || 'Any'}
                          </td>
                          <td className='px-6 py-4 text-sm whitespace-nowrap text-gray-500'>
                            {spec.property || 'N/A'}
                          </td>
                          <td className='px-6 py-4 text-sm text-gray-500'>{spec.requirement || 'Required'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className='mt-8'>
          <BackLink href='/ids-files'>&larr; Back to IDS Files</BackLink>
        </div>
      </div>
    </Layout>
  )
}
