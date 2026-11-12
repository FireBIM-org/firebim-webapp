import { isAxiosError } from 'axios';

/**
 * Error codes returned by the API (and the webapp proxy) for limit-related rejections.
 * Body shape: `{ "detail": "...", "code": "<CODE>" }`.
 */
export const RATE_LIMITED = 'RATE_LIMITED';
export const PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE';
export const STORAGE_LIMIT_EXCEEDED = 'STORAGE_LIMIT_EXCEEDED';
export const USER_QUOTA_EXCEEDED = 'USER_QUOTA_EXCEEDED';

/** Statuses where retrying the same request immediately cannot succeed. */
const NON_RETRYABLE_STATUSES = new Set([401, 413, 429, 507]);
const NON_RETRYABLE_CODES = new Set([
  RATE_LIMITED,
  PAYLOAD_TOO_LARGE,
  STORAGE_LIMIT_EXCEEDED,
  USER_QUOTA_EXCEEDED,
]);

export interface ApiErrorInfo {
  status?: number;
  code?: string;
  detail?: unknown;
  retryAfterSeconds?: number;
}

/**
 * Parses a Retry-After header (delta-seconds or HTTP-date) into whole seconds from now.
 */
export function parseRetryAfter(value: unknown, now: number = Date.now()): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? Math.ceil(value) : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

function readHeader(headers: unknown, name: string): unknown {
  if (!headers || typeof headers !== 'object') return undefined;
  const maybe = headers as { get?: (key: string) => unknown } & Record<string, unknown>;
  if (typeof maybe.get === 'function') {
    const value = maybe.get(name);
    if (value !== undefined && value !== null) return value;
  }
  return maybe[name] ?? maybe[name.toLowerCase()];
}

/**
 * Normalises axios errors and the `Error(responseText)` thrown by the fetch-based feature
 * clients into one shape. Returns null when the error carries no API information.
 */
export function getApiErrorInfo(error: unknown): ApiErrorInfo | null {
  if (isAxiosError(error)) {
    const response = error.response;
    if (!response) return null;
    const data = response.data as { code?: unknown; detail?: unknown } | undefined;
    return {
      status: response.status,
      code: typeof data?.code === 'string' ? data.code : undefined,
      detail: data?.detail,
      retryAfterSeconds: parseRetryAfter(readHeader(response.headers, 'retry-after')),
    };
  }
  if (error instanceof Error && error.message.trimStart().startsWith('{')) {
    try {
      const data = JSON.parse(error.message) as { code?: unknown; detail?: unknown };
      if (typeof data?.code === 'string') return { code: data.code, detail: data.detail };
    } catch {
      // Not a JSON error body
    }
  }
  return null;
}

/**
 * User-facing message for rate-limit, size and storage rejections; null for anything else.
 */
export function getLimitErrorMessage(error: unknown): string | null {
  const info = getApiErrorInfo(error);
  if (!info) return null;
  const { status, code, retryAfterSeconds } = info;

  if (code === RATE_LIMITED || status === 429) {
    return retryAfterSeconds !== undefined
      ? `Too many requests — try again in ${Math.max(1, retryAfterSeconds)} s`
      : 'Too many requests — please try again shortly';
  }
  if (code === PAYLOAD_TOO_LARGE || status === 413) {
    return 'File/request too large';
  }
  if (code === USER_QUOTA_EXCEEDED) {
    return 'Your storage quota is full — contact support';
  }
  if (code === STORAGE_LIMIT_EXCEEDED || status === 507) {
    return 'Storage limit reached — contact support';
  }
  return null;
}

/**
 * Extracts a human-readable error message from an API error.
 * Returns null for 401s — those are handled by the auth interceptor (re-login redirect).
 */
export function getApiErrorMessage(error: unknown): string | null {
  if (isAxiosError(error)) {
    if (error.response?.status === 401) return null;
    const limitMessage = getLimitErrorMessage(error);
    if (limitMessage) return limitMessage;
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    // FastAPI 422 returns detail as an array of validation errors
    if (Array.isArray(detail)) {
      return (detail as Array<{ msg: string }>).map((e) => e.msg).join(', ');
    }
    if (!error.response) return 'Network error — please check your connection';
    const status = error.response.status;
    if (status >= 500) return 'Server error — please try again later';
    return `Request failed (${status})`;
  }
  const limitMessage = getLimitErrorMessage(error);
  if (limitMessage) return limitMessage;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

/** Message for a failed upload: the specific limit message when there is one, else the fallback. */
export function getUploadErrorMessage(error: unknown, fallback: string): string {
  return getLimitErrorMessage(error) ?? fallback;
}

/** True for errors that must not be retried automatically (auth, rate limit, size, storage). */
export function isNonRetryableError(error: unknown): boolean {
  const info = getApiErrorInfo(error);
  if (!info) return false;
  return (
    (info.status !== undefined && NON_RETRYABLE_STATUSES.has(info.status)) ||
    (info.code !== undefined && NON_RETRYABLE_CODES.has(info.code))
  );
}

/** React Query `retry` predicate: one retry, except for errors retrying cannot fix. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isNonRetryableError(error)) return false;
  return failureCount < 1;
}
