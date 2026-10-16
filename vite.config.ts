import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Node's process, typed minimally (the project does not install @types/node).
declare const process: { env: Record<string, string | undefined> };

/** Short commit hash of the build: GitHub Actions provides GITHUB_SHA; local builds say 'dev'. */
function commitHash(): string {
  return process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';
}

// Served from the root of the custom domain (theaterofconquest.com), so no base path is needed.
export default defineConfig(() => ({
  base: '/',
  plugins: [preact()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(commitHash()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // The randomized determinism runs take ~2s locally but much longer on CI runners.
    testTimeout: 60_000,
  },
}));
