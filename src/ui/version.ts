// Filled in by vite.config.ts at build time.
declare const __BUILD_COMMIT__: string;
declare const __BUILD_DATE__: string;

/** The milestone this build belongs to; bump it when a milestone ships. */
export const MILESTONE = '2c';

/** Shown on the title screen, e.g. "Milestone 2c · build aa5f9f4 · 2026-10-16". */
export const VERSION_LABEL = `Milestone ${MILESTONE} · build ${__BUILD_COMMIT__} · ${__BUILD_DATE__}`;
