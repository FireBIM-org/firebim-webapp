import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  turbopack: {
    root: __dirname,
    resolveAlias: {
      "env": "./src/utils/next-dummy.ts",
      "wasi_snapshot_preview1": "./src/utils/next-dummy.ts"
    }
  }
};

export default nextConfig;
