import { describe, it, expect } from 'vitest';
import { keyToAction } from '../../src/ui/keys';

describe('keyToAction', () => {
  it('maps numpad codes and letter keys to directions', () => {
    expect(keyToAction('8', 'Numpad8')).toEqual({ kind: 'move', dir: 0 });
    expect(keyToAction('ArrowUp', 'Numpad8')).toEqual({ kind: 'move', dir: 0 });
    expect(keyToAction('3', 'Numpad3')).toEqual({ kind: 'move', dir: 3 });
    expect(keyToAction('q', 'KeyQ')).toEqual({ kind: 'move', dir: 7 });
    expect(keyToAction('C', 'KeyC')).toEqual({ kind: 'move', dir: 3 });
    expect(keyToAction('a', 'KeyA')).toEqual({ kind: 'move', dir: 6 });
  });

  it('maps commands and panning', () => {
    expect(keyToAction(' ', 'Space')).toEqual({ kind: 'next' });
    expect(keyToAction('n', 'KeyN')).toEqual({ kind: 'next' });
    expect(keyToAction('s', 'KeyS')).toEqual({ kind: 'skip' });
    expect(keyToAction('Enter', 'Enter')).toEqual({ kind: 'endTurn' });
    expect(keyToAction('f', 'KeyF')).toEqual({ kind: 'center' });
    expect(keyToAction('Escape', 'Escape')).toEqual({ kind: 'deselect' });
    expect(keyToAction('ArrowLeft', 'ArrowLeft')).toEqual({ kind: 'pan', dx: -3, dy: 0 });
    expect(keyToAction('y', 'KeyY')).toBeNull();
  });
});
