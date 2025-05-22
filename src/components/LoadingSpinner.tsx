import React from 'react';

const LoadingSpinner: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex justify-center items-center h-64 ${className}`}>
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
  </div>
);

export default LoadingSpinner;
