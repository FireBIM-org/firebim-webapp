const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');

const WEBAPP_BASE = (
  process.env.WEBAPP_BASE_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');

async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') || '';
  let body = null;

  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    const text = await response.text();
    body = text || null;
  }

  return { ok: response.ok, status: response.status, body };
}

function ensureOk(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed with ${result.status}: ${JSON.stringify(result.body)}`);
  }
}

function ensureUnauthorized(result, label) {
  if (![401, 403].includes(result.status)) {
    throw new Error(
      `${label} expected 401/403 but got ${result.status}: ${JSON.stringify(result.body)}`
    );
  }
}

async function runDirectApiChecks() {
  const rulesHealth = await requestJson(`${API_BASE}/rules/health`);
  const graphsHealth = await requestJson(`${API_BASE}/graphs/health`);
  const authProbe = await requestJson(`${API_BASE}/users/me`);

  ensureOk(rulesHealth, 'Direct rules health');
  ensureOk(graphsHealth, 'Direct graphs health');
  ensureUnauthorized(authProbe, 'Direct authorization check');

  return {
    rules_health: rulesHealth.body,
    graphs_health: graphsHealth.body,
    authorization_status: authProbe.status,
  };
}

async function runProxyChecks() {
  const proxyRulesHealth = await requestJson(`${WEBAPP_BASE}/api/proxy/rules/health`);

  if (proxyRulesHealth.status === 404) {
    return {
      proxy_available: false,
      note: 'Proxy route is not available on this branch yet.',
    };
  }

  ensureUnauthorized(proxyRulesHealth, 'Proxy authorization check');

  return {
    proxy_available: true,
    authorization_status: proxyRulesHealth.status,
  };
}

async function main() {
  const direct = await runDirectApiChecks();
  const proxy = await runProxyChecks();

  console.log(
    JSON.stringify(
      {
        api_base: API_BASE,
        webapp_base: WEBAPP_BASE,
        direct,
        proxy,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
