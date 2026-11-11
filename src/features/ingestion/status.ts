import axios from 'axios';

import type { IngestionJob } from '@/utils/api-client';

export function isIngestionActive(job?: IngestionJob) {
  return !!job && ['queued', 'running', 'retry_wait'].includes(job.status);
}

export function ingestionError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (typeof detail?.message === 'string') return detail.message;
  }
  return error instanceof Error ? error.message : 'The request failed. Please try again.';
}

export function rulebookHref(graphId: string) {
  return `/rulebook?graph_id=${encodeURIComponent(graphId)}`;
}
