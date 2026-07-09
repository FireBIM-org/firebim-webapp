import type { GetServerSideProps } from 'next';

import React from 'react';

import FileInfo from '../components/FileInfo';

interface BackendBuildInfo {
  git_branch: string;
  git_commit: string;
  build_time: string;
  environment: string;
}

interface BuildInfoPageProps {
  backend: BackendBuildInfo | null;
  backendError: string | null;
}

export const getServerSideProps: GetServerSideProps<BuildInfoPageProps> = async () => {
  const apiBackend = process.env.API_BACKEND_URL || 'http://localhost:8000';
  try {
    const res = await fetch(`${apiBackend}/build-info`);
    if (!res.ok) {
      return { props: { backend: null, backendError: `HTTP ${res.status}` } };
    }
    const backend = (await res.json()) as BackendBuildInfo;
    return { props: { backend, backendError: null } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { props: { backend: null, backendError: message } };
  }
};

const BuildInfoPage: React.FC<BuildInfoPageProps> = ({ backend, backendError }) => {
  const frontendFields = [
    { label: 'API Endpoint', value: process.env.NEXT_PUBLIC_API_HOST || 'Not set' },
    { label: 'Git Branch', value: process.env.NEXT_PUBLIC_GIT_BRANCH || 'Unknown' },
    { label: 'Git Commit', value: process.env.NEXT_PUBLIC_GIT_COMMIT || 'Unknown' },
    { label: 'Build Time', value: process.env.NEXT_PUBLIC_BUILD_TIME || 'Unknown' },
    { label: 'Node Environment', value: process.env.NODE_ENV || 'Unknown' },
  ];

  const backendFields = backend
    ? [
        { label: 'Git Branch', value: backend.git_branch },
        { label: 'Git Commit', value: backend.git_commit },
        { label: 'Build Time', value: backend.build_time },
        { label: 'Environment', value: backend.environment },
      ]
    : [{ label: 'Error', value: backendError ?? 'Failed to fetch backend build info' }];

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <FileInfo
        title="Frontend Build Information"
        description="Details about the current frontend build and environment."
        fields={frontendFields}
      />
      <FileInfo
        title="Backend Build Information"
        description="Details about the current backend build and environment."
        fields={backendFields}
      />
    </div>
  );
};

export default BuildInfoPage;
