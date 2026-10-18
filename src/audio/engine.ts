import { SOUND_GAP_MS } from './fromEvents';
import { OVERRIDES, SYNTH, type SoundName } from './sounds';

export interface SoundSettings {
  enabled: boolean;
  /** 0 to 1. */
  volume: number;
}

export const SETTINGS_KEY = 'conquest.sound';
export const DEFAULT_SETTINGS: SoundSettings = { enabled: true, volume: 0.6 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function loadSettings(): SoundSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SoundSettings>;
      return {
        enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.enabled,
        volume: typeof s.volume === 'number' && Number.isFinite(s.volume) ? clamp01(s.volume) : DEFAULT_SETTINGS.volume,
      };
    }
  } catch { /* storage blocked or unreadable: use the defaults */ }
  return { ...DEFAULT_SETTINGS };
}

let settings: SoundSettings | null = null;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const decoded = new Map<string, AudioBuffer>();

export function getSettings(): SoundSettings {
  return (settings ??= loadSettings());
}

export function setSettings(patch: Partial<SoundSettings>): SoundSettings {
  const next = { ...getSettings(), ...patch };
  next.volume = clamp01(next.volume);
  settings = next;
  if (master) master.gain.value = next.volume;
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch { /* storage blocked: the setting lasts until the page is closed */ }
  return next;
}

/** Forgets the cached settings and audio context (for tests). */
export function resetAudio(): void {
  settings = null;
  ctx = null;
  master = null;
  buffers.clear();
  decoded.clear();
}

/** The audio context, created on first use; null when the browser has none. */
function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = getSettings().volume;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/** Fetches and decodes a recorded override once; null if it cannot be loaded. */
function loadBuffer(url: string, c: AudioContext): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => c.decodeAudioData(data))
      .then((b) => { decoded.set(url, b); return b; })
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

function playAt(name: SoundName, delaySec: number): void {
  const c = context();
  if (!c || !master) return;
  const t = c.currentTime + delaySec + 0.01;
  const url = OVERRIDES[name];
  if (url) {
    const b = decoded.get(url);
    if (b) {
      const src = c.createBufferSource();
      src.buffer = b;
      src.connect(master);
      src.start(t);
      return;
    }
    // Not loaded yet: start loading it and use the synth this once.
    void loadBuffer(url, c);
  }
  SYNTH[name](c, master, t);
}

/** Plays one effect now. Does nothing when sound is off or the browser has no Web Audio. */
export function play(name: SoundName): void {
  playAll([name]);
}

/** Plays effects one after another, SOUND_GAP_MS apart. */
export function playAll(names: readonly SoundName[]): void {
  if (!getSettings().enabled || names.length === 0) return;
  try {
    const c = context();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => {});
    names.forEach((n, i) => playAt(n, (i * SOUND_GAP_MS) / 1000));
  } catch { /* never let a sound problem break the game */ }
}

/**
 * iOS Safari only lets audio start after a tap, so the first tap or key press creates and resumes the audio context.
 * Call once at startup; it is safe to call again.
 */
let unlockInstalled = false;
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof document === 'undefined') return;
  unlockInstalled = true;
  const unlock = () => {
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    try {
      const c = context();
      if (c && c.state === 'suspended') void c.resume().catch(() => {});
    } catch { /* ignore */ }
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}
