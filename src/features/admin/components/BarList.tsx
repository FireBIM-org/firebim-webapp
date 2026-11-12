import React, { ReactNode } from 'react';

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Text shown for the value, e.g. formatted bytes. */
  display: string;
  /** Optional secondary text, e.g. an object count. */
  detail?: string;
}

interface BarListProps {
  items: BarListItem[];
  /** Accessible name of the list. */
  label: string;
  emptyText?: string;
}

/**
 * Horizontal bars scaled to the largest value. The numbers are plain text in each row; the bars are
 * decorative (aria-hidden), so screen readers get a simple list.
 */
const BarList: React.FC<BarListProps> = ({ items, label, emptyText = 'No data' }) => {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 0);

  return (
    <ul aria-label={label} className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate text-gray-900">{item.label}</span>
            <span className="shrink-0 text-gray-700">
              {item.display}
              {item.detail && <span className="ml-2 text-xs text-gray-500">{item.detail}</span>}
            </span>
          </div>
          <div aria-hidden="true" className="mt-1 h-2 w-full rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-orange-500"
              style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

export default BarList;
