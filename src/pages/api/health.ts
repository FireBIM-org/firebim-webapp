import type { NextApiRequest, NextApiResponse } from 'next'

const API_BACKEND = process.env.API_BACKEND_URL || 'http://localhost:8000'
const AUTHENTIK_ISSUER_URL = process.env.AUTHENTIK_ISSUER_URL ?? ''

type HealthResponse = {
  status: 'ok' | 'degraded'
  checks: Record<string, string>
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse<HealthResponse>) {
  const checks: Record<string, string> = {}
  let healthy = true

  // Run upstream checks concurrently to avoid additive timeouts
  const apiPromise = fetch(`${API_BACKEND}/health`, {
    signal: AbortSignal.timeout(3000),
  })

  const authentikPromise =
    AUTHENTIK_ISSUER_URL && AUTHENTIK_ISSUER_URL.trim() !== ''
      ? fetch(`${AUTHENTIK_ISSUER_URL.replace(/\/+$/, '')}/.well-known/openid-configuration`, {
          signal: AbortSignal.timeout(3000),
        })
      : null

  const [apiResult, authentikResult] = await Promise.allSettled([apiPromise, authentikPromise || Promise.resolve(null)])

  // API backend
  if (apiResult.status === 'fulfilled') {
    const resp = apiResult.value
    if (resp && resp.ok) {
      checks['api'] = 'ok'
    } else {
      checks['api'] = `error: HTTP ${resp?.status ?? 'unknown'}`
      healthy = false
    }
  } else {
    console.error('API backend health check failed:', apiResult.reason)
    checks['api'] = 'error: unreachable'
    healthy = false
  }

  // Authentik
  if (authentikPromise === null) {
    checks['authentik'] = 'not configured'
  } else if (authentikResult.status === 'fulfilled') {
    const resp = authentikResult.value
    if (resp && resp.ok) {
      checks['authentik'] = 'ok'
    } else {
      checks['authentik'] = `error: HTTP ${resp?.status ?? 'unknown'}`
      healthy = false
    }
  } else {
    console.error('Authentik health check failed:', authentikResult.reason)
    checks['authentik'] = 'error: unreachable'
    healthy = false
  }

  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks })
}
