import React from 'react';

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

const PrimaryButton: React.FC<PrimaryButtonProps> = ({ children, className = '', ...props }) => (
  <button
    type="button"
    className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${className}`}
    {...props}
  >
    {children}
  </button>
);

export default PrimaryButton;
