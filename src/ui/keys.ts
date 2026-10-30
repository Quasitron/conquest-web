import type { Dir } from '../engine';

export type ActionId = 'next' | 'skip' | 'hold' | 'sentry' | 'repair' | 'moveTo' | 'patrol' | 'goHome' | 'explore'
  | 'load' | 'unload' | 'clearOrders' | 'disband' | 'center' | 'endTurn' | 'info' | 'fit' | 'escort' | 'airbase' | 'sabotage' | 'hurt' | 'incite';

export type KeyAction =
  | { kind: 'move'; dir: Dir }
  | { kind: 'arrow'; dir: Dir; dx: number; dy: number }
  | { kind: 'action'; id: ActionId }
  | { kind: 'escape' };

const NUMPAD: Record<string, Dir> = {
  Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3, Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7,
};
const NAV: Record<string, Dir> = { Home: 7, PageUp: 1, End: 5, PageDown: 3 };
const ARROWS: Record<string, { dir: Dir; dx: number; dy: number }> = {
  ArrowUp: { dir: 0, dx: 0, dy: -3 },
  ArrowRight: { dir: 2, dx: 3, dy: 0 },
  ArrowDown: { dir: 4, dx: 0, dy: 3 },
  ArrowLeft: { dir: 6, dx: -3, dy: 0 },
};
const ACTIONS: Record<string, ActionId> = {
  n: 'next', ' ': 'skip', tab: 'hold', s: 'sentry', r: 'repair', t: 'moveTo', p: 'patrol', h: 'goHome', x: 'explore',
  e: 'escort', b: 'airbase', g: 'sabotage', m: 'hurt', v: 'incite', l: 'load', u: 'unload', insert: 'clearOrders', delete: 'disband', c: 'center', enter: 'endTurn', i: 'info', z: 'fit',
};

export function keyToAction(key: string, code: string): KeyAction | null {
  if (code in NUMPAD) return { kind: 'move', dir: NUMPAD[code] };
  if (key in NAV) return { kind: 'move', dir: NAV[key] };
  if (key in ARROWS) return { kind: 'arrow', ...ARROWS[key] };
  if (key === 'Escape') return { kind: 'escape' };
  const k = key.toLowerCase();
  if (k in ACTIONS) return { kind: 'action', id: ACTIONS[k] };
  return null;
}
