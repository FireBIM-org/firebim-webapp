const trimSlash = (value: string) => value.replace(/\/+$/, '');

export const env = {
  appBasePath: process.env.NEXT_PUBLIC_APP_BASE_PATH || '',
  apiBaseUrl: trimSlash(
    process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
  ),
  rulesApiBaseUrl: trimSlash(
    process.env.NEXT_PUBLIC_RULES_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://localhost:8000'
  ),
};