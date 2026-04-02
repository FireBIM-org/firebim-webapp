import type { NextApiRequest, NextApiResponse } from "next";

const API_BACKEND = process.env.API_BACKEND_URL || "http://localhost:8000";
const AUTHENTIK_ISSUER_URL = process.env.AUTHENTIK_ISSUER_URL ?? "";

type HealthResponse = {
  status: "ok" | "degraded";
  checks: Record<string, string>;
};

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<HealthResponse>,
) {
  const checks: Record<string, string> = {};
  let healthy = true;

  // API backend
  try {
    const resp = await fetch(`${API_BACKEND}/health`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      checks["api"] = "ok";
    } else {
      checks["api"] = `error: HTTP ${resp.status}`;
      healthy = false;
    }
  } catch (e) {
    checks["api"] = `error: ${e instanceof Error ? e.message : String(e)}`;
    healthy = false;
  }

  // Authentik
  try {
    const issuer = AUTHENTIK_ISSUER_URL.replace(/\/+$/, "");
    const resp = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) {
      checks["authentik"] = "ok";
    } else {
      checks["authentik"] = `error: HTTP ${resp.status}`;
      healthy = false;
    }
  } catch (e) {
    checks["authentik"] = `error: ${e instanceof Error ? e.message : String(e)}`;
    healthy = false;
  }

  res
    .status(healthy ? 200 : 503)
    .json({ status: healthy ? "ok" : "degraded", checks });
}
