import type { Dir } from '../engine';

export type KeyAction =
  | { kind: 'move'; dir: Dir }
  | { kind: 'next' }
  | { kind: 'skip' }
  | { kind: 'endTurn' }
  | { kind: 'center' }
  | { kind: 'deselect' }
  | { kind: 'pan'; dx: number; dy: number };

const NUMPAD: Record<string, Dir> = {
  Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3, Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7,
};
const LETTERS: Record<string, Dir> = { w: 0, e: 1, d: 2, c: 3, x: 4, z: 5, a: 6, q: 7 };
const PAN: Record<string, [number, number]> = {
  ArrowUp: [0, -3], ArrowDown: [0, 3], ArrowLeft: [-3, 0], ArrowRight: [3, 0],
};

export function keyToAction(key: string, code: string): KeyAction | null {
  if (code in NUMPAD) return { kind: 'move', dir: NUMPAD[code] };
  if (code in PAN) return { kind: 'pan', dx: PAN[code][0], dy: PAN[code][1] };
  const k = key.toLowerCase();
  if (k in LETTERS) return { kind: 'move', dir: LETTERS[k] };
  if (k === ' ' || k === 'n') return { kind: 'next' };
  if (k === 's') return { kind: 'skip' };
  if (k === 'enter') return { kind: 'endTurn' };
  if (k === 'f') return { kind: 'center' };
  if (k === 'escape') return { kind: 'deselect' };
  return null;
}
