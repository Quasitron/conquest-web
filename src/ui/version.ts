// Filled in by vite.config.ts at build time.
declare const __BUILD_COMMIT__: string;
declare const __BUILD_DATE__: string;

/** The game's version, three parts until 1.0 (0.9.1, 0.9.2, ...). Bump the last number when a feature ships (see docs/versions.md). */
export const VERSION = '0.9.24';

/** Shown on the title screen, e.g. "Version 0.9.5 · build aa5f9f4 · 2026-10-28". */
export const VERSION_LABEL = `Version ${VERSION} · build ${__BUILD_COMMIT__} · ${__BUILD_DATE__}`;
