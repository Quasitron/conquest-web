import { describe, it, expect } from 'vitest';
import { advanceProduction, buildTime, setProduction } from '../../src/engine/production';
import type { GameEvent } from '../../src/engine/types';
import { makeGame } from '../helpers';

const P = ['*##.', '##*.'];

function advance(s: ReturnType<typeof makeGame>, pid: number, times: number, events: GameEvent[] = []) {
  for (let i = 0; i < times; i++) advanceProduction(s, pid, events);
  return events;
}

describe('production', () => {
  it('builds an army after 6 turns, then repeats every 5', () => {
    const s = makeGame(P, { rules: { fairFirstTurn: true } });
    expect(advance(s, 0, 5)).toEqual([]);
    const events = advance(s, 0, 1);
    expect(s.units).toHaveLength(1);
    expect(s.units[0]).toMatchObject({ type: 'army', owner: 0, x: 0, y: 0, movesLeft: 1 });
    expect(events).toEqual([{ type: 'unitProduced', unitId: s.units[0].id, cityId: 0, unitType: 'army' }]);
    expect(s.cities[0]).toMatchObject({ progress: 0, lastBuilt: 'army' });
    advance(s, 0, 4);
    expect(s.units).toHaveLength(1);
    advance(s, 0, 1);
    expect(s.units).toHaveLength(2);
  });

  it('changing production discards progress; re-selecting the same type keeps it', () => {
    const s = makeGame(P);
    const c1 = s.cities[1];
    advance(s, 1, 3);
    expect(setProduction(s, c1, 'army')).toBeNull();
    expect(c1.progress).toBe(3);
    expect(setProduction(s, c1, 'destroyer')).toBeNull();
    expect(c1.progress).toBe(0);
    expect(buildTime(c1, 'destroyer')).toBe(24);
  });

  it('only coastal cities build ships', () => {
    const s = makeGame(P);
    expect(setProduction(s, s.cities[0], 'transport')).toBe('inland cities cannot build ships');
    expect(setProduction(s, s.cities[1], 'transport')).toBeNull();
  });

  it('the repeat bonus depends on the last unit actually built', () => {
    const s = makeGame(P);
    const c0 = s.cities[0];
    advance(s, 0, 6);
    setProduction(s, c0, 'fighter');
    setProduction(s, c0, 'army');
    expect(buildTime(c0, 'army')).toBe(5);
    expect(buildTime(c0, 'fighter')).toBe(12);
  });

  it('a city with no production builds nothing; new fighters have full fuel', () => {
    const s = makeGame(P);
    setProduction(s, s.cities[0], null);
    advance(s, 0, 20);
    expect(s.units).toHaveLength(0);
    setProduction(s, s.cities[0], 'fighter');
    advance(s, 0, 12);
    expect(s.units[0]).toMatchObject({ type: 'fighter', fuel: 20, movesLeft: 5 });
  });

  it('only advances cities of the given player', () => {
    const s = makeGame(P, { rules: { fairFirstTurn: true } });
    advance(s, 1, 2);
    expect(s.cities[0].progress).toBe(0);
    expect(s.cities[1].progress).toBe(2);
  });
});
