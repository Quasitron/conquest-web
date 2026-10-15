import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/conquest-web/' : '/',
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
