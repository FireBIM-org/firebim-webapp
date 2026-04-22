import React from 'react';

const LoadingSpinner: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex h-64 items-center justify-center ${className}`}>
    <div className="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-orange-500"></div>
  </div>
);

export default LoadingSpinner;
