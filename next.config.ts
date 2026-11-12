import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

// Report-only for now: the IFC viewer relies on WASM, web workers and blob: URLs, and Umami
// loads from cloud.umami.is. Watch the browser console for violations, then switch to the
// enforcing Content-Security-Policy header.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''} blob: https://cloud.umami.is`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://cloud.umami.is https://api-gateway.umami.dev",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "env": "./src/utils/next-dummy.ts",
      "wasi_snapshot_preview1": "./src/utils/next-dummy.ts"
    }
  }
};

export default nextConfig;
