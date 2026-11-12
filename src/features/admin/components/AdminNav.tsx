import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import { isActiveRoute } from '../../../utils/nav';

const TABS = [
  { name: 'Overview', href: '/admin', matchPrefix: false },
  { name: 'Users', href: '/admin/users', matchPrefix: true },
  { name: 'Storage', href: '/admin/storage', matchPrefix: true },
  { name: 'System', href: '/admin/system', matchPrefix: true },
];

/** Sub-navigation shared by the admin pages. */
const AdminNav: React.FC = () => {
  const router = useRouter();

  return (
    <nav aria-label="Admin" className="border-b border-gray-200">
      <ul className="-mb-px flex space-x-6 overflow-x-auto">
        {TABS.map((tab) => {
          const active = isActiveRoute(router.pathname, tab.href, tab.matchPrefix);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`${
                  active
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                } inline-flex border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap`}
              >
                {tab.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default AdminNav;
