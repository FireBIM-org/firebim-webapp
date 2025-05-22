import React from 'react';
import Link from 'next/link';

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

const BackLink: React.FC<BackLinkProps> = ({ href, children, className = '' }) => (
  <Link href={href} className={`text-orange-600 hover:text-orange-900 ${className}`}>
    {children}
  </Link>
);

export default BackLink;
