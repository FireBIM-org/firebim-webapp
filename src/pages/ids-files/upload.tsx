import { useRouter } from 'next/router'
import React, { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'react-toastify'

import Layout from '../../components/Layout'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useAuth } from '../../contexts/AuthContext'
import apiClient from '../../utils/api-client'

export default function UploadIdsFile() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [authLoading, user, router])

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return
      }

      const file = acceptedFiles[0]

      // Check if the file is an IDS file
      if (!file.name.toLowerCase().endsWith('.ids') && !file.name.toLowerCase().endsWith('.xml')) {
        toast.error('Please upload an IDS file (.ids or .xml extension)')
        return
      }

      setIsUploading(true)
      setUploadProgress(0)

      try {
        await apiClient.uploadIds(file)
        toast.success('IDS file uploaded successfully!')
        router.push('/ids-files')
      } catch (error) {
        console.error('Upload error:', error)
        toast.error('Failed to upload IDS file. Please try again.')
      } finally {
        setIsUploading(false)
      }
    },
    [router]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: isUploading,
  })

  if (authLoading || !user) {
    return (
      <Layout title='Uploading... | FireBIM'>
        <LoadingSpinner />
      </Layout>
    )
  }

  return (
    <Layout title='Upload IDS File | FireBIM'>
      <div className='py-6'>
        <h1 className='text-2xl font-semibold text-gray-900'>Upload IDS File</h1>
        <p className='mt-1 text-sm text-gray-500'>Upload an IDS specification file to use for IFC model validation</p>
      </div>

      <div className='mt-5 md:mt-0'>
        <div className='shadow sm:overflow-hidden sm:rounded-md'>
          <div className='space-y-6 bg-white px-4 py-5 sm:p-6'>
            <div>
              <label className='block text-sm font-medium text-gray-700'>IDS File</label>
              <div className='mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pt-5 pb-6'>
                <div className='space-y-1 text-center' {...getRootProps()}>
                  <input {...getInputProps()} id='fileInput' />
                  <svg
                    className='mx-auto h-12 w-12 text-gray-400'
                    stroke='currentColor'
                    fill='none'
                    viewBox='0 0 48 48'
                    aria-hidden='true'
                  >
                    <path
                      d='M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02'
                      strokeWidth={2}
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    />
                  </svg>
                  <div className='flex text-sm text-gray-600'>
                    <p className='pl-1'>
                      {isDragActive
                        ? 'Drop the file here'
                        : isUploading
                          ? 'Uploading...'
                          : 'Drag and drop an IDS file, or click to select'}
                    </p>
                  </div>
                  <p className='text-xs text-gray-500'>IDS files (.ids or .xml)</p>
                </div>
              </div>
            </div>

            {isUploading && (
              <div className='mt-4'>
                <div className='overflow-hidden rounded-full bg-gray-200'>
                  <div className='h-2 rounded-full bg-orange-500' style={{ width: `${uploadProgress}%` }}></div>
                </div>
                <p className='mt-2 text-center text-sm text-gray-500'>Uploading... {uploadProgress}%</p>
              </div>
            )}
          </div>
          <div className='bg-gray-50 px-4 py-3 text-right sm:px-6'>
            <button
              onClick={() => router.push('/ids-files')}
              type='button'
              className='mr-3 inline-flex justify-center rounded-md border border-transparent bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none'
            >
              Cancel
            </button>
            <button
              type='button'
              className='inline-flex justify-center rounded-md border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none'
              onClick={() => document.getElementById('fileInput')?.click()}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload IDS File'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
