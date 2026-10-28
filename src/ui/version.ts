// Filled in by vite.config.ts at build time.
declare const __BUILD_COMMIT__: string;
declare const __BUILD_DATE__: string;

/** The game's version, major.minor. Bump the minor number when a feature ships (see docs/versions.md). */
export const VERSION = '0.7';

/** Shown on the title screen, e.g. "Version 0.7 · build aa5f9f4 · 2026-10-28". */
export const VERSION_LABEL = `Version ${VERSION} · build ${__BUILD_COMMIT__} · ${__BUILD_DATE__}`;
