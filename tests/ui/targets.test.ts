import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { updateFog } from '../../src/engine/fog';
import { dirTo, stepTargets } from '../../src/ui/targets';
import { addUnit, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];

describe('stepTargets', () => {
  it('offers land squares to an army and marks enemies as attacks', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    addUnit(s, 'army', 1, 2, 0);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    const t = stepTargets(v, v.myUnits.find((u) => u.id === a.id)!);
    const at = (x: number, y: number) => t.find((p) => p.x === x && p.y === y);
    expect(at(0, 1)).toMatchObject({ attack: false });
    expect(at(2, 0)).toMatchObject({ attack: true });
    expect(at(2, 2)).toMatchObject({ attack: true });
    expect(at(0, 0)).toMatchObject({ attack: false });
  });

  it('offers nothing to a unit with no moves, and water only to ships', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 1, 1, { movesLeft: 0 });
    addUnit(s, 'destroyer', 0, 4, 1);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    expect(stepTargets(v, v.myUnits[0])).toEqual([]);
    const d = stepTargets(v, v.myUnits[1]);
    expect(d.every((p) => v.terrain[p.y * v.width + p.x] === 'water')).toBe(true);
  });

  it('finds the direction between adjacent squares, including across the seam', () => {
    const s = makeGame(M, { wrap: true });
    const v = getPlayerView(s, 0);
    expect(dirTo(v, { x: 1, y: 1 }, { x: 2, y: 1 })).toBe(2);
    expect(dirTo(v, { x: 0, y: 1 }, { x: 6, y: 1 })).toBe(6);
    expect(dirTo(v, { x: 0, y: 1 }, { x: 3, y: 1 })).toBeNull();
  });
});
