import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve the `@/*` alias from tsconfig.json, like Next does.
  resolve: { tsconfigPaths: true },
});
