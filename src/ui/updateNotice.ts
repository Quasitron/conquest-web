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
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker) markUpdateReady(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const check = () => { reg.update().catch(() => { /* offline: nothing to check */ }); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.setInterval(check, RECHECK_MS);
    }).catch(() => { /* no worker: the game still works online */ });
  });
}
