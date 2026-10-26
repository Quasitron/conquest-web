import { describe, it, expect } from 'vitest';
import { keyToAction } from '../../src/ui/keys';

describe('keyToAction', () => {
  it('maps numpad codes to directions, even when NumLock sends arrow keys', () => {
    expect(keyToAction('8', 'Numpad8')).toEqual({ kind: 'move', dir: 0 });
    expect(keyToAction('ArrowUp', 'Numpad8')).toEqual({ kind: 'move', dir: 0 });
    expect(keyToAction('3', 'Numpad3')).toEqual({ kind: 'move', dir: 3 });
    expect(keyToAction('9', 'Numpad9')).toEqual({ kind: 'move', dir: 1 });
    expect(keyToAction('1', 'Numpad1')).toEqual({ kind: 'move', dir: 5 });
    expect(keyToAction('7', 'Numpad7')).toEqual({ kind: 'move', dir: 7 });
  });

  it('maps Home, PageUp, End and PageDown to diagonal directions', () => {
    expect(keyToAction('Home', 'Home')).toEqual({ kind: 'move', dir: 7 });
    expect(keyToAction('PageUp', 'PageUp')).toEqual({ kind: 'move', dir: 1 });
    expect(keyToAction('End', 'End')).toEqual({ kind: 'move', dir: 5 });
    expect(keyToAction('PageDown', 'PageDown')).toEqual({ kind: 'move', dir: 3 });
  });

  it('maps arrow keys to arrow actions with a three-tile step', () => {
    expect(keyToAction('ArrowUp', 'ArrowUp')).toEqual({ kind: 'arrow', dir: 0, dx: 0, dy: -3 });
    expect(keyToAction('ArrowRight', 'ArrowRight')).toEqual({ kind: 'arrow', dir: 2, dx: 3, dy: 0 });
    expect(keyToAction('ArrowDown', 'ArrowDown')).toEqual({ kind: 'arrow', dir: 4, dx: 0, dy: 3 });
    expect(keyToAction('ArrowLeft', 'ArrowLeft')).toEqual({ kind: 'arrow', dir: 6, dx: -3, dy: 0 });
  });

  it('maps command keys case-insensitively', () => {
    expect(keyToAction('n', 'KeyN')).toEqual({ kind: 'action', id: 'next' });
    expect(keyToAction('N', 'KeyN')).toEqual({ kind: 'action', id: 'next' });
    expect(keyToAction(' ', 'Space')).toEqual({ kind: 'action', id: 'skip' });
    expect(keyToAction('Tab', 'Tab')).toEqual({ kind: 'action', id: 'hold' });
    expect(keyToAction('s', 'KeyS')).toEqual({ kind: 'action', id: 'sentry' });
    expect(keyToAction('t', 'KeyT')).toEqual({ kind: 'action', id: 'moveTo' });
    expect(keyToAction('p', 'KeyP')).toEqual({ kind: 'action', id: 'patrol' });
    expect(keyToAction('h', 'KeyH')).toEqual({ kind: 'action', id: 'goHome' });
    expect(keyToAction('x', 'KeyX')).toEqual({ kind: 'action', id: 'explore' });
    expect(keyToAction('l', 'KeyL')).toEqual({ kind: 'action', id: 'load' });
    expect(keyToAction('u', 'KeyU')).toEqual({ kind: 'action', id: 'unload' });
    expect(keyToAction('Insert', 'Insert')).toEqual({ kind: 'action', id: 'clearOrders' });
    expect(keyToAction('Delete', 'Delete')).toEqual({ kind: 'action', id: 'disband' });
    expect(keyToAction('c', 'KeyC')).toEqual({ kind: 'action', id: 'center' });
    expect(keyToAction('f', 'KeyF')).toBeNull();
    expect(keyToAction('Enter', 'Enter')).toEqual({ kind: 'action', id: 'endTurn' });
  });

  it('maps Escape to escape', () => {
    expect(keyToAction('Escape', 'Escape')).toEqual({ kind: 'escape' });
  });

  it('no longer maps the old letter-direction keys or unbound letters', () => {
    for (const k of ['q', 'w', 'a', 'd']) {
      expect(keyToAction(k, `Key${k.toUpperCase()}`)).toBeNull();
    }
    expect(keyToAction('y', 'KeyY')).toBeNull();
  });
});

describe('info and fit keys', () => {
  it('maps i to info and z to fit', () => {
    expect(keyToAction('i', 'KeyI')).toEqual({ kind: 'action', id: 'info' });
    expect(keyToAction('z', 'KeyZ')).toEqual({ kind: 'action', id: 'fit' });
  });
});