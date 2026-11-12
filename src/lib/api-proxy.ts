import type { IncomingHttpHeaders } from 'node:http';

/**
 * Pure helpers for the API proxy route (src/pages/api/proxy/[...path].ts).
 * Kept free of Next.js / next-auth imports so they can be unit tested in isolation.
 */

export const DEFAULT_PROXY_TIMEOUT_MS = 120_000;
export const DEFAULT_PROXY_MAX_BODY_BYTES = 524_288_000; // 500 MiB, matches the API's MAX_UPLOAD_BYTES

/** Request headers copied verbatim from the browser request to the API. */
const FORWARDED_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'accept-language',
  'traceparent',
  'tracestate',
] as const;

/** Response headers copied verbatim from the API response back to the browser. */
const MIRRORED_RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'content-length',
  'cache-control',
  'retry-after',
  'x-request-id',
] as const;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export class PayloadTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`Request body exceeds ${limitBytes} bytes`);
    this.name = 'PayloadTooLargeError';
  }
}

/** Parses a positive integer from an env var, falling back to the default when unset/invalid. */
export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Builds the API URL for the proxied catch-all path segments (already decoded by Next).
 * Each segment is re-encoded and appended to the backend URL, never resolved against it,
 * so a segment such as `http://evil.example` or `//evil.example` cannot change the host.
 * Returns null for dot segments or anything that would leave the backend origin.
 */
export function buildUpstreamUrl(backend: string, segments: readonly string[]): URL | null {
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;
  const base = new URL(backend);
  const prefix = base.pathname.replace(/\/+$/, '');
  const url = new URL(`${base.origin}${prefix}/${segments.map(encodeURIComponent).join('/')}`);
  return url.origin === base.origin ? url : null;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Strips the IPv4-mapped IPv6 prefix (`::ffff:10.42.0.7` → `10.42.0.7`). */
export function normalizeIp(address: string | undefined): string | undefined {
  if (!address) return undefined;
  return address.startsWith('::ffff:') && address.includes('.') ? address.slice(7) : address;
}

/**
 * Appends the direct peer address to any incoming X-Forwarded-For chain, the same way
 * a reverse proxy does. The API only honours the chain when the peer (this pod) is trusted.
 */
export function buildForwardedFor(
  incoming: string | string[] | undefined,
  remoteAddress: string | undefined,
): string | undefined {
  const chain = (Array.isArray(incoming) ? incoming.join(',') : (incoming ?? ''))
    .split(',')
    .map((part) => normalizeIp(part.trim()))
    .filter((part): part is string => !!part);
  const peer = normalizeIp(remoteAddress);
  // Next's server already fills a missing X-Forwarded-For with the peer address; don't repeat it.
  if (peer && chain[chain.length - 1] !== peer) chain.push(peer);
  return chain.length > 0 ? chain.join(', ') : undefined;
}

/** Reuses a well-formed incoming X-Request-ID, otherwise generates a new one. */
export function resolveRequestId(
  incoming: string | string[] | undefined,
  generate: () => string = () => crypto.randomUUID(),
): string {
  const value = firstHeader(incoming)?.trim();
  return value && REQUEST_ID_PATTERN.test(value) ? value : generate();
}

export interface UpstreamHeaderOptions {
  accessToken: string;
  requestId: string;
  remoteAddress?: string;
}

/** Builds the header set sent to the API. Everything not listed here is dropped (cookies etc.). */
export function buildUpstreamHeaders(
  incoming: IncomingHttpHeaders,
  { accessToken, requestId, remoteAddress }: UpstreamHeaderOptions,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = firstHeader(incoming[name]);
    if (value) headers[name] = value;
  }

  const forwardedFor = buildForwardedFor(incoming['x-forwarded-for'], remoteAddress);
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;

  headers['x-request-id'] = requestId;
  headers['authorization'] = `Bearer ${accessToken}`;
  // Ask for an uncompressed response so Content-Length can be mirrored as-is
  // (fetch would transparently decompress and make the upstream length wrong).
  headers['accept-encoding'] = 'identity';
  return headers;
}

/** Selects the API response headers that are passed back to the browser. */
export function pickResponseHeaders(upstream: Headers): Array<[string, string]> {
  const picked: Array<[string, string]> = [];
  const encoded = upstream.has('content-encoding');
  for (const name of MIRRORED_RESPONSE_HEADERS) {
    if (name === 'content-length' && encoded) continue;
    const value = upstream.get(name);
    if (value !== null) picked.push([name, value]);
  }
  upstream.forEach((value, name) => {
    if (name.toLowerCase().startsWith('x-ratelimit-')) picked.push([name, value]);
  });
  return picked;
}

/** True when the method/headers indicate a request body worth forwarding. */
export function hasRequestBody(method: string | undefined, headers: IncomingHttpHeaders): boolean {
  if (method === 'GET' || method === 'HEAD') return false;
  if (headers['transfer-encoding']) return true;
  const length = Number(firstHeader(headers['content-length']) ?? 0);
  return Number.isFinite(length) && length > 0;
}

/** Content-Length pre-check: rejects before reading a byte when the declared size is too large. */
export function exceedsBodyLimit(contentLength: string | undefined, maxBytes: number): boolean {
  if (!contentLength) return false;
  const length = Number(contentLength);
  return Number.isFinite(length) && length > maxBytes;
}

export interface LimitBodyHooks {
  /** Called once the source is fully consumed within the limit. */
  onComplete?: () => void;
  /** Called right before PayloadTooLargeError is thrown. */
  onLimitExceeded?: () => void;
}

/**
 * Re-yields the chunks of `source` while keeping a running byte count, so the cap holds
 * even for chunked uploads or a lying Content-Length. Throws PayloadTooLargeError on overflow.
 */
export async function* limitBody(
  source: AsyncIterable<Uint8Array | string>,
  maxBytes: number,
  hooks: LimitBodyHooks = {},
): AsyncGenerator<Uint8Array> {
  let received = 0;
  for await (const chunk of source) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    received += bytes.byteLength;
    if (received > maxBytes) {
      hooks.onLimitExceeded?.();
      throw new PayloadTooLargeError(maxBytes);
    }
    yield bytes;
  }
  hooks.onComplete?.();
}
