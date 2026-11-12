import type { NextApiRequest, NextApiResponse } from 'next';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { SpanKind, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';
import { getServerSession } from 'next-auth/next';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  DEFAULT_PROXY_MAX_BODY_BYTES,
  DEFAULT_PROXY_TIMEOUT_MS,
  buildUpstreamHeaders,
  buildUpstreamUrl,
  exceedsBodyLimit,
  hasRequestBody,
  limitBody,
  parsePositiveInt,
  pickResponseHeaders,
  resolveRequestId,
} from '../../../lib/api-proxy';
import { authOptions } from '../auth/[...nextauth]';

const API_BACKEND = process.env.API_BACKEND_URL || 'http://localhost:8000';
// Max wait for the API's response headers, counted from when the request body has been
// fully forwarded (so slow client uploads don't eat into it).
const PROXY_TIMEOUT_MS = parsePositiveInt(
  process.env.API_PROXY_TIMEOUT_MS,
  DEFAULT_PROXY_TIMEOUT_MS,
);
const MAX_BODY_BYTES = parsePositiveInt(
  process.env.API_PROXY_MAX_BODY_BYTES,
  DEFAULT_PROXY_MAX_BODY_BYTES,
);

const tracer = trace.getTracer('firebim-webapp.api-proxy');

export const config = {
  api: {
    bodyParser: false, // stream the body as-is (needed for file uploads)
    responseLimit: false, // downloads are streamed through, not buffered
  },
};

/**
 * For responses sent while the client may still be uploading: nothing reads the rest of
 * the body any more, so close the connection afterwards instead of leaving the client
 * stalled on a paused keep-alive socket (or draining up to MAX_BODY_BYTES for nothing).
 */
function closeAfterResponse(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Connection', 'close');
  res.once('finish', () => req.destroy());
}

function sendPayloadTooLarge(req: NextApiRequest, res: NextApiResponse) {
  closeAfterResponse(req, res);
  res.status(413).json({
    code: 'PAYLOAD_TOO_LARGE',
    detail: `Request body exceeds the ${MAX_BODY_BYTES} byte limit`,
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  res.setHeader('X-Request-ID', requestId);

  // getServerSession runs the full jwt callback (including token refresh logic)
  // unlike getToken which only decodes the cookie without triggering refresh
  const session = await getServerSession(req, res, authOptions);

  if (session?.error === 'RefreshAccessTokenError') {
    return res
      .status(401)
      .json({ code: 'SESSION_EXPIRED', detail: 'Session expired — please log in again' });
  }

  if (!session?.accessToken) {
    return res.status(401).json({ code: 'NOT_AUTHENTICATED', detail: 'Not authenticated' });
  }

  if (exceedsBodyLimit(req.headers['content-length'], MAX_BODY_BYTES)) {
    return sendPayloadTooLarge(req, res);
  }

  // Build the upstream URL from the catch-all segments. They are appended to the backend
  // URL, not resolved against it, so the request (and its bearer token) stays on the API.
  const { path } = req.query;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  const url = buildUpstreamUrl(API_BACKEND, segments);
  if (!url) {
    return res.status(400).json({ code: 'INVALID_PATH', detail: 'Invalid API path' });
  }

  // Forward query-string parameters
  const qs = req.url?.split('?')[1];
  if (qs) {
    url.search = `?${qs}`;
  }

  const method = req.method ?? 'GET';
  const headers = buildUpstreamHeaders(req.headers, {
    accessToken: session.accessToken,
    requestId,
    remoteAddress: req.socket.remoteAddress,
  });

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let responded = false;
  let bodyTooLarge = false;
  const startTimeout = () => {
    if (responded || timer) return;
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, PROXY_TIMEOUT_MS);
  };

  // Stream the request body to the API with a running size check instead of buffering
  // it in memory (the pod's memory limit is far below the upload limit).
  let body: AsyncIterable<Uint8Array> | undefined;
  if (hasRequestBody(method, req.headers)) {
    body = limitBody(req.iterator({ destroyOnReturn: false }), MAX_BODY_BYTES, {
      onComplete: startTimeout,
      onLimitExceeded: () => {
        bodyTooLarge = true;
      },
    });
  } else {
    startTimeout();
  }

  // Stop talking to the API when the browser goes away.
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  return tracer.startActiveSpan(
    `api-proxy ${method}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.request.method': method,
        'url.full': url.toString(),
        'server.address': url.hostname,
        'http.request.header.x-request-id': requestId,
      },
    },
    async (span) => {
      // Overwrites any browser-supplied traceparent with this span when tracing is active;
      // a no-op otherwise, so the incoming header is passed through unchanged.
      propagation.inject(context.active(), headers);

      try {
        const upstreamRes = await fetch(url, {
          method,
          headers,
          body: body as BodyInit | undefined,
          duplex: 'half',
          signal: controller.signal,
        } as RequestInit);
        responded = true;
        clearTimeout(timer);
        span.setAttribute('http.response.status_code', upstreamRes.status);
        if (upstreamRes.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });

        // The API answered before reading the whole body (e.g. 429, 401, 413, 507).
        if (body && !req.complete) {
          closeAfterResponse(req, res);
        }

        // Mirror status and relevant headers
        res.status(upstreamRes.status);
        for (const [name, value] of pickResponseHeaders(upstreamRes.headers)) {
          res.setHeader(name, value);
        }

        if (!upstreamRes.body || method === 'HEAD') {
          res.end();
          return;
        }

        // Stream the response body
        await pipeline(Readable.fromWeb(upstreamRes.body as NodeReadableStream), res);
      } catch (err) {
        clearTimeout(timer);
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });

        if (res.headersSent) {
          // Failure mid-stream: nothing sensible left to send.
          if (!res.destroyed) res.destroy();
          if (!controller.signal.aborted) console.error('Proxy stream error:', err);
          return;
        }
        if (bodyTooLarge) {
          return sendPayloadTooLarge(req, res);
        }
        if (timedOut) {
          console.error(`Proxy timeout after ${PROXY_TIMEOUT_MS} ms: ${method} ${url.pathname}`);
          return res.status(504).json({
            code: 'UPSTREAM_TIMEOUT',
            detail: 'Gateway timeout — API server did not respond in time',
          });
        }
        if (controller.signal.aborted) {
          return; // client disconnected
        }
        console.error('Proxy error:', err);
        res.status(502).json({ detail: 'Bad gateway — could not reach API server' });
      } finally {
        span.end();
      }
    },
  );
}
