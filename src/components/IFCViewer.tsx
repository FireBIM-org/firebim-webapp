import React from 'react';

const IFCViewer: React.FC = () => {
  return (
    <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg h-[600px] flex items-center justify-center">
      <div className="text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">IFC Viewer Placeholder</h3>
        <p className="mt-1 text-sm text-gray-500">The 3D viewer will be implemented here.</p>
      </div>
    </div>
  );
};

export default IFCViewer;
