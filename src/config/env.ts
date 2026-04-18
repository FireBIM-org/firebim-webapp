const trimSlash = (value: string) => value.replace(/\/+$/, '');
const browserApiHost = trimSlash(process.env.NEXT_PUBLIC_API_HOST || '');
const apiProxyBaseUrl = browserApiHost ? `${browserApiHost}/api/proxy` : '/api/proxy';

export const env = {
  apiHost: browserApiHost,
  apiBaseUrl: apiProxyBaseUrl,
  rulesApiBaseUrl: apiProxyBaseUrl,
  apiDocsUrl: `${apiProxyBaseUrl}/docs`,
};
