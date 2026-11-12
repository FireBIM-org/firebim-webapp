import Link from 'next/link';
import React, { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Small line under the value, e.g. a breakdown or a comparison. */
  detail?: ReactNode;
  isLoading?: boolean;
  href?: string;
  linkLabel?: string;
}

/** A KPI card in the same style as the dashboard's stat cards. */
const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  detail,
  isLoading,
  href,
  linkLabel,
}) => (
  <div className="overflow-hidden rounded-lg bg-white shadow">
    <div className="px-4 py-5 sm:p-6">
      <dl>
        <dt className="truncate text-sm font-medium text-gray-500">{label}</dt>
        <dd
          className="mt-1 text-3xl font-semibold text-gray-900"
          aria-busy={isLoading || undefined}
        >
          {isLoading ? <div className="h-8 w-12 animate-pulse rounded bg-gray-200"></div> : value}
        </dd>
        {detail && !isLoading && <dd className="mt-1 text-sm text-gray-500">{detail}</dd>}
      </dl>
    </div>
    {href && linkLabel && (
      <div className="bg-gray-50 px-4 py-4 sm:px-6">
        <Link href={href} className="text-sm font-medium text-orange-600 hover:text-orange-500">
          {linkLabel} <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    )}
  </div>
);

export default StatCard;
