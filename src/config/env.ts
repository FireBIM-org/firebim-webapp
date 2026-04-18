const trimSlash = (value: string) => value.replace(/\/+$/, '');
const browserApiHost = trimSlash(
  process.env.NEXT_PUBLIC_API_HOST ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ''
);
const apiProxyBaseUrl = browserApiHost ? `${browserApiHost}/api/proxy` : '/api/proxy';

export const env = {
  appBasePath: process.env.NEXT_PUBLIC_APP_BASE_PATH || '',
  apiHost: browserApiHost,
  apiBaseUrl: apiProxyBaseUrl,
  rulesApiBaseUrl: apiProxyBaseUrl,
  apiDocsUrl: `${apiProxyBaseUrl}/docs`,
};
