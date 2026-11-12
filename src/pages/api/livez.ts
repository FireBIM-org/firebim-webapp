import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Liveness probe: answers as long as the Node process serves requests.
 * Deliberately checks no dependencies (use /api/health for that).
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse<{ status: 'ok' }>) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ status: 'ok' });
}
