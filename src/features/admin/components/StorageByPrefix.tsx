import React from 'react';

import type { StoragePrefixUsage } from '../api';

import { formatBytes, formatNumber } from '../format';
import BarList from './BarList';

/** Bytes per top-level key prefix (models, ids, results, ...), largest first. */
const StorageByPrefix: React.FC<{ usage: StoragePrefixUsage[]; emptyText?: string }> = ({
  usage,
  emptyText = 'No objects stored yet.',
}) => (
  <BarList
    label="Storage by prefix"
    emptyText={emptyText}
    items={[...usage]
      .sort((a, b) => b.bytes - a.bytes || a.prefix.localeCompare(b.prefix))
      .map((item) => ({
        key: item.prefix,
        label: <span className="font-mono">{item.prefix}/</span>,
        value: item.bytes,
        display: formatBytes(item.bytes),
        detail: `${formatNumber(item.objects)} objects`,
      }))}
  />
);

export default StorageByPrefix;
