import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH || '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;