import type { NextApiRequest, NextApiResponse } from 'next';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '../auth/[...nextauth]';

const API_BACKEND = process.env.API_BACKEND_URL || 'http://localhost:8000';

export const config = {
  api: {
    bodyParser: false, // stream the body as-is (needed for file uploads)
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  // Build the upstream URL from the catch-all segments
  const { path } = req.query;
  const upstream = Array.isArray(path) ? path.join('/') : (path ?? '');
  const url = new URL(upstream, API_BACKEND);

  // Forward query-string parameters
  const qs = req.url?.split('?')[1];
  if (qs) {
    url.search = `?${qs}`;
  }

  // Collect the raw body (handles both JSON and multipart/form-data)
  const bodyChunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    req.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
    req.on('end', resolve);
  });
  const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

  // Build headers — forward content-type so multipart boundaries are preserved
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
  };
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  }

  try {
    const upstream_res = await fetch(url.toString(), {
      method: req.method,
      headers,
      body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    });

    // Mirror status and relevant headers
    res.status(upstream_res.status);

    const ct = upstream_res.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);

    const cd = upstream_res.headers.get('content-disposition');
    if (cd) res.setHeader('Content-Disposition', cd);

    // Stream the response body
    const arrayBuffer = await upstream_res.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ detail: 'Bad gateway — could not reach API server' });
  }
}
