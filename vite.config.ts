import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Served from the root of the custom domain (theaterofconquest.com), so no base path is needed.
export default defineConfig(() => ({
  base: '/',
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.ts'],
    // The randomized determinism runs take ~2s locally but much longer on CI runners.
    testTimeout: 60_000,
  },
}));
