import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../../src/engine';
import { cityLook, surfaceAt } from '../../src/ui/terrainTiles';

/** A 3x3 view: the middle square is a city, `ring` is the ground of the eight squares round it (row by row, without the middle). */
function view(ring: string, wrap = false): PlayerView {
  const map: Record<string, string> = { c: 'clear', d: 'desert', f: 'forest', r: 'rough', m: 'mountain', v: 'river' };
  const relief: string[] = [];
  const terrain: string[] = [];
  let k = 0;
  for (let i = 0; i < 9; i++) {
    if (i === 4) { relief.push('clear'); terrain.push('city'); continue; }
    const ch = ring[k++];
    if (ch === '~') { relief.push('clear'); terrain.push('water'); } else { relief.push(map[ch]); terrain.push('land'); }
  }
  return { width: 3, height: 3, wrap, terrain, relief } as unknown as PlayerView;
}

describe('the look of a city square', () => {
  it('takes the ground most of its neighbours have, so a city in a desert is not on a green patch', () => {
    expect(cityLook(view('dddddddd'), 1, 1)).toBe('desert');
    expect(cityLook(view('dddcdddd'), 1, 1)).toBe('desert');
    expect(cityLook(view('ffffffff'), 1, 1)).toBe('forest');
    expect(cityLook(view('rrrrrrrr'), 1, 1)).toBe('rough');
  });

  it('stays clear unless another ground has more of the neighbours, and counts rivers as clear and mountains as rough', () => {
    expect(cityLook(view('ddddcccc'), 1, 1)).toBe('clear'); // a tie
    expect(cityLook(view('dcccccdd'), 1, 1)).toBe('clear');
    expect(cityLook(view('vvvvvvvv'), 1, 1)).toBe('clear');
    expect(cityLook(view('mmmmmmmm'), 1, 1)).toBe('rough');
    expect(cityLook(view('~~~~~~~~'), 1, 1)).toBe('clear'); // nothing but sea
    expect(cityLook(view('~~~~dddd'), 1, 1)).toBe('desert'); // sea is not counted
  });

  it('is used for city squares only, and a map with no terrain stays clear', () => {
    const v = view('dddddddd');
    expect(surfaceAt(v, 1, 1)).toBe('desert');
    expect(surfaceAt(v, 0, 0)).toBe('desert');
    expect(surfaceAt({ ...v, relief: undefined } as unknown as PlayerView, 1, 1)).toBe('clear');
  });
});
