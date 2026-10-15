import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ?'/conquest-web/' : '/',
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
