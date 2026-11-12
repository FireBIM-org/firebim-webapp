import React from 'react';

import { formatBytes, formatPercent, usageLevel, type UsageLevel } from '../format';

const FILL: Record<UsageLevel, string> = {
  ok: 'bg-orange-600',
  warning: 'bg-yellow-500',
  critical: 'bg-red-600',
};

const STATUS: Record<UsageLevel, { text: string; className: string }> = {
  ok: { text: 'Within limits', className: 'text-gray-500' },
  warning: { text: 'Above warning threshold', className: 'font-medium text-yellow-700' },
  critical: {
    text: 'Limit reached — new uploads are rejected',
    className: 'font-medium text-red-700',
  },
};

interface UsageMeterProps {
  label: string;
  usedBytes: number;
  /** 0 means "no limit": the meter then only shows the used amount. */
  limitBytes: number;
  /** Fraction of the limit from which the bar turns to the warning colour. */
  warnRatio: number;
}

/**
 * Used vs. limit as an accessible meter (role="meter" with aria-value*), with a tick at the warning
 * threshold. The level is spelled out in text as well, so it does not rely on colour alone.
 */
const UsageMeter: React.FC<UsageMeterProps> = ({ label, usedBytes, limitBytes, warnRatio }) => {
  const id = React.useId();
  const hasLimit = limitBytes > 0;
  const ratio = hasLimit ? usedBytes / limitBytes : 0;
  const level = hasLimit ? usageLevel(ratio, warnRatio) : 'ok';
  const width = `${Math.min(ratio, 1) * 100}%`;
  const summary = hasLimit
    ? `${formatBytes(usedBytes)} of ${formatBytes(limitBytes)} (${formatPercent(ratio)})`
    : `${formatBytes(usedBytes)} used, no limit configured`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span id={`${id}-label`} className="text-sm font-medium text-gray-900">
          {label}
        </span>
        <span className="text-sm text-gray-700">{summary}</span>
      </div>
      {hasLimit && (
        <>
          <div
            role="meter"
            aria-labelledby={`${id}-label`}
            aria-valuemin={0}
            aria-valuemax={limitBytes}
            aria-valuenow={Math.min(usedBytes, limitBytes)}
            aria-valuetext={summary}
            className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200"
          >
            <div className={`h-full rounded-full ${FILL[level]}`} style={{ width }} />
            {warnRatio > 0 && warnRatio < 1 && (
              <div
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 bg-gray-500"
                style={{ left: `${warnRatio * 100}%` }}
                title={`Warning threshold: ${formatPercent(warnRatio)}`}
              />
            )}
          </div>
          <p className={`mt-1 text-xs ${STATUS[level].className}`}>
            {STATUS[level].text}
            {warnRatio > 0 && ` · warning at ${formatPercent(warnRatio)}`}
          </p>
        </>
      )}
    </div>
  );
};

export default UsageMeter;
