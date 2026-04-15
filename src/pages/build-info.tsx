import React from 'react'

import FileInfo from '../components/FileInfo'

// These values should be injected at build time. For now, use placeholders or environment variables.
const buildInfo = {
  apiEndpoint: process.env.NEXT_PUBLIC_API_HOST || 'Not set',
  gitBranch: process.env.NEXT_PUBLIC_GIT_BRANCH || 'Unknown',
  gitCommit: process.env.NEXT_PUBLIC_GIT_COMMIT || 'Unknown',
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || 'Unknown',
  nodeEnv: process.env.NODE_ENV || 'Unknown',
}

const fields = [
  { label: 'API Endpoint', value: buildInfo.apiEndpoint },
  { label: 'Git Branch', value: buildInfo.gitBranch },
  { label: 'Git Commit', value: buildInfo.gitCommit },
  { label: 'Build Time', value: buildInfo.buildTime },
  { label: 'Node Environment', value: buildInfo.nodeEnv },
]

const BuildInfoPage: React.FC = () => (
  <div className='mx-auto max-w-2xl py-10'>
    <FileInfo
      title='Build Information'
      description='Details about the current build and environment.'
      fields={fields}
    />
  </div>
)

export default BuildInfoPage
