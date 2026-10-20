import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { cacheVersion, serviceWorkerSource } from './tools/offlineWorker';
// The project's type check has no Node typings; this config only uses Node to list and measure the public files.
// @ts-ignore
import { readdirSync, statSync } from 'node:fs';

// Node's process, typed minimally (the project does not install @types/node).
declare const process: { env: Record<string, string | undefined> };

/** Short commit hash of the build: GitHub Actions provides GITHUB_SHA; local builds say 'dev'. */
function commitHash(): string {
  return process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev';
}

/** Files under a folder as `a/b.png` style paths with their sizes (empty if the folder does not exist). */
function listFiles(dir: string, prefix = ''): { name: string; size: number }[] {
  let entries: string[] = [];
  try { entries = readdirSync(dir) as string[]; } catch { return []; }
  return entries.flatMap((e) => {
    const full = `${dir}/${e}`;
    const st = statSync(full) as { isDirectory(): boolean; size: number };
    return st.isDirectory() ? listFiles(full, `${prefix}${e}/`) : [{ name: `${prefix}${e}`, size: st.size }];
  });
}

/** Writes sw.js into the build: the service worker that makes the game playable offline (see tools/offlineWorker.ts). */
function offlineWorker(): Plugin {
  let publicDir = 'public';
  return {
    name: 'offline-worker',
    apply: 'build',
    configResolved(config) { publicDir = config.publicDir || 'public'; },
    generateBundle(_options, bundle) {
      const built = Object.values(bundle).map((f) => ({
        name: f.fileName,
        size: f.type === 'chunk' ? f.code.length : String(f.source).length,
      }));
      const files = [...built, ...listFiles(publicDir)];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource(files.map((f) => f.name), cacheVersion(files.map((f) => `${f.name}:${f.size}`))),
      });
    },
  };
}
// Served from the root of the custom domain (theaterofconquest.com), so no base path is needed.
export default defineConfig(() => ({
  base: '/',
  plugins: [preact(), offlineWorker()],
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
