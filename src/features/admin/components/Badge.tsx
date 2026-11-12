import React, { ReactNode } from 'react';

export type BadgeTone = 'green' | 'red' | 'yellow' | 'gray' | 'orange';

const TONES: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  gray: 'bg-gray-100 text-gray-700',
  orange: 'bg-orange-100 text-orange-800',
};

/** A small pill label; the text carries the meaning, the colour only reinforces it. */
const Badge: React.FC<{ tone: BadgeTone; children: ReactNode; title?: string }> = ({
  tone,
  children,
  title,
}) => (
  <span
    title={title}
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
  >
    {children}
  </span>
);

export default Badge;

/** Status pill for a health check: `ok` is green, anything else is shown verbatim in red. */
export const CheckStatus: React.FC<{ status: string }> = ({ status }) => (
  <Badge tone={status === 'ok' ? 'green' : 'red'}>{status === 'ok' ? 'OK' : status}</Badge>
);
