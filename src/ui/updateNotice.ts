import { useEffect, useState } from 'preact/hooks';

/**
 * "A new version is ready": the offline worker (see tools/offlineWorker.ts) downloads a new version in the background
 * and takes over; the page that is already open keeps running the old code until it is reloaded, so this tells the
 * player (a banner with a Reload button) instead of leaving them to guess.
 */
let ready = false;
const listeners = new Set<(r: boolean) => void>();

export const isUpdateReady = () => ready;

export function markUpdateReady(): void {
  ready = true;
  for (const l of listeners) l(true);
}

/** Only for tests. */
export function resetUpdateReady(): void {
  ready = false;
  listeners.clear();
}

export function onUpdateReady(listener: (r: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** True once a new version has been downloaded and is waiting for a reload. */
export function useUpdateReady(): boolean {
  const [r, setR] = useState(ready);
  useEffect(() => onUpdateReady(setR), []);
  return r;
}

/** The game's own script in a page, e.g. "/assets/index-AbC123.js": its name changes with every build. Other scripts (analytics) are ignored. */
export function entryScript(html: string): string | null {
  const tags = html.match(/<script\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (src && /^\/assets\/.+\.js$/.test(src)) return src;
  }
  return null;
}

/**
 * Whether the version the worker has just taken over with differs from the code this page is running. A reload gets the
 * newest page from the network even before the worker has switched, so the page can already be up to date when the
 * worker announces the same build: then there is nothing to reload for. When unsure, it says yes.
 */
async function newVersionWaiting(): Promise<boolean> {
  try {
    const running = entryScript([...document.scripts].map((s) => s.outerHTML).join('\n'));
    const latest = entryScript(await (await fetch('/')).text());
    return !running || !latest || running !== latest;
  } catch {
    return true;
  }
}

const RECHECK_MS = 60 * 60 * 1000;

/**
 * Registers the offline worker (production builds only: the development server has no worker file), asks it to check
 * for a new version when the app comes back to the foreground and once an hour, and reports when one has arrived.
 * A worker taking over a page that had none (the very first visit) is not an update.
 */
export function registerOfflineWorker(): void {
  const prod = (import.meta as { env?: { PROD?: boolean } }).env?.PROD;
  if (!('serviceWorker' in navigator) || !prod) return;
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker) void newVersionWaiting().then((waiting) => { if (waiting) markUpdateReady(); });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const check = () => { reg.update().catch(() => { /* offline: nothing to check */ }); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.setInterval(check, RECHECK_MS);
    }).catch(() => { /* no worker: the game still works online */ });
  });
}
