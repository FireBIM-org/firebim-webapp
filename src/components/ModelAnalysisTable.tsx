import React from 'react';

const ModelAnalysisTable: React.FC = () => {
  return (
    <div className="mt-8">
      <h3 className="mb-4 text-lg leading-6 font-medium text-gray-900">Analysis History</h3>
      <div className="overflow-hidden border border-gray-200 bg-white shadow sm:rounded-lg">
        <div className="p-12 text-center text-gray-500 italic">
          Model analysis history will be displayed here.
        </div>
      </div>
    </div>
  );
};

export default ModelAnalysisTable;
