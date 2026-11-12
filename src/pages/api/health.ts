import type { NextApiRequest, NextApiResponse } from 'next';

import {
  type HealthReport,
  NOT_CONFIGURED,
  aggregateHealth,
  resolveHealthConfig,
  runHealthCheck,
} from '../../lib/health';

/**
 * Aggregate health of the webapp's dependencies, for humans, blackbox probes and dashboards.
 * Not used by Kubernetes probes: they use /api/livez, so a slow API or an Authentik outage
 * never restarts the webapp.
 */

const API_BACKEND = (process.env.API_BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '');
const AUTHENTIK_ISSUER_URL = (
  process.env.AUTHENTIK_INTERNAL_ISSUER_URL?.trim() ||
  process.env.AUTHENTIK_ISSUER_URL?.trim() ||
  ''
).replace(/\/+$/, '');
const CONFIG = resolveHealthConfig(process.env);

export default async function handler(_req: NextApiRequest, res: NextApiResponse<HealthReport>) {
  // Run upstream checks concurrently to avoid additive timeouts
  const [api, authentik] = await Promise.all([
    runHealthCheck(`${API_BACKEND}/health`, CONFIG.apiTimeoutMs),
    AUTHENTIK_ISSUER_URL
      ? runHealthCheck(
          `${AUTHENTIK_ISSUER_URL}/.well-known/openid-configuration`,
          CONFIG.authentikTimeoutMs,
        )
      : NOT_CONFIGURED,
  ]);

  const { httpStatus, report } = aggregateHealth({ api, authentik });
  res.setHeader('Cache-Control', 'no-store');
  res.status(httpStatus).json(report);
}
