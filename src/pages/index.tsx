import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <Layout title="Home | FireBIM">
      <div className="relative overflow-hidden">
        <div className="pt-10 pb-16 sm:pt-16 lg:pt-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:grid lg:grid-cols-12 lg:gap-8">
              <div className="sm:text-center md:mx-auto md:max-w-2xl lg:col-span-6 lg:text-left">
                <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
                  <span className="block">Building Information</span>
                  <span className="block text-orange-600">Management Tools</span>
                </h1>
                <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                  FireBIM allows you to upload, manage, and analyze IFC models using IDS files.
                  Validate your building information models against industry standards and
                  requirements.
                </p>
                <div className="mt-8 sm:flex sm:justify-center lg:justify-start">
                  {!user ? (
                    <>
                      <div className="rounded-md shadow">
                        <Link
                          href="/register"
                          className="flex w-full items-center justify-center rounded-md border border-transparent bg-orange-600 px-8 py-3 text-base font-medium text-white hover:bg-orange-700 md:py-4 md:px-10 md:text-lg"
                        >
                          Register
                        </Link>
                      </div>
                      <div className="mt-3 sm:mt-0 sm:ml-3">
                        <Link
                          href="/login"
                          className="flex w-full items-center justify-center rounded-md border border-transparent bg-gray-100 px-8 py-3 text-base font-medium text-gray-900 hover:bg-gray-200 md:py-4 md:px-10 md:text-lg"
                        >
                          Login
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-md shadow">
                      <Link
                        href="/dashboard"
                        className="flex w-full items-center justify-center rounded-md border border-transparent bg-orange-600 px-8 py-3 text-base font-medium text-white hover:bg-orange-700 md:py-4 md:px-10 md:text-lg"
                      >
                        Go to Dashboard
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-12 sm:mt-16 lg:col-span-6 lg:mt-0">
                <div className="relative mx-auto w-full rounded-lg shadow-xl lg:max-w-md">
                  <div className="relative block w-full overflow-hidden rounded-lg bg-white">
                    <Image
                      src="/window.svg"
                      alt="BIM Model Visualization"
                      className="w-full h-64 object-cover"
                      width={800}
                      height={256}
                      priority
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-medium text-white bg-black bg-opacity-50 px-4 py-2 rounded">
                        BIM Model Analysis
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:text-center">
              <h2 className="text-lg font-semibold text-orange-600">Features</h2>
              <p className="mt-2 text-3xl font-bold leading-8 tracking-tight text-gray-900 sm:text-4xl">
                A better way to manage BIM models
              </p>
              <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
                Upload, manage, and analyze your IFC models with ease using our comprehensive tools.
              </p>
            </div>

            <div className="mt-10">
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                <div className="pt-6">
                  <div className="flow-root rounded-lg bg-gray-50 px-6 pb-8">
                    <div className="-mt-6">
                      <div>
                        <span className="inline-flex items-center justify-center rounded-md bg-orange-500 p-3 shadow-lg">
                          <svg
                            className="h-6 w-6 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                        </span>
                      </div>
                      <h3 className="mt-8 text-lg font-medium tracking-tight text-gray-900">
                        Upload IFC Models
                      </h3>
                      <p className="mt-5 text-base text-gray-500">
                        Upload your IFC models to analyze and validate against specifications.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flow-root rounded-lg bg-gray-50 px-6 pb-8">
                    <div className="-mt-6">
                      <div>
                        <span className="inline-flex items-center justify-center rounded-md bg-orange-500 p-3 shadow-lg">
                          <svg
                            className="h-6 w-6 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </span>
                      </div>
                      <h3 className="mt-8 text-lg font-medium tracking-tight text-gray-900">
                        Manage IDS Files
                      </h3>
                      <p className="mt-5 text-base text-gray-500">
                        Upload and manage Information Delivery Specification files for model
                        validation.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flow-root rounded-lg bg-gray-50 px-6 pb-8">
                    <div className="-mt-6">
                      <div>
                        <span className="inline-flex items-center justify-center rounded-md bg-orange-500 p-3 shadow-lg">
                          <svg
                            className="h-6 w-6 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                            />
                          </svg>
                        </span>
                      </div>
                      <h3 className="mt-8 text-lg font-medium tracking-tight text-gray-900">
                        Analyze and Validate
                      </h3>
                      <p className="mt-5 text-base text-gray-500">
                        Run compliance checks on your models against IDS specifications to ensure
                        they meet requirements.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
