import React from 'react'

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  className?: string
}

const PrimaryButton: React.FC<PrimaryButtonProps> = ({ children, className = '', ...props }) => (
  <button
    type='button'
    className={`inline-flex items-center rounded-md border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:outline-none ${className}`}
    {...props}
  >
    {children}
  </button>
)

export default PrimaryButton
