import { describe, it, expect } from 'vitest';
import type { LogEntry } from '../../src/app/session';
import { builtThisTurn, readyUnits } from '../../src/ui/cycle';
import { addUnit, makeGame } from '../helpers';

const M = ['*##', '###', '##*'];

describe('readyUnits', () => {
  it('offers only units with moves left, no orders and not held', () => {
    const s = makeGame(M);
    const ready = addUnit(s, 'army', 0, 0, 1);
    const sleeping = addUnit(s, 'army', 0, 1, 1, { orders: { kind: 'sentry' } });
    const spent = addUnit(s, 'army', 0, 1, 0, { movesLeft: 0 });
    const held = addUnit(s, 'army', 0, 2, 1);
    const ids = readyUnits(s.units, new Set(), new Set([held.id]), []).map((u) => u.id);
    expect(ids).toEqual([ready.id]);
    expect(ids).not.toContain(sleeping.id);
    expect(ids).not.toContain(spent.id);
  });

  it('puts new units first, then the rest, both in ascending id order', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 0, 1);
    const b = addUnit(s, 'army', 0, 1, 1);
    const c = addUnit(s, 'army', 0, 1, 0);
    const d = addUnit(s, 'army', 0, 2, 1);
    const ids = readyUnits(s.units, new Set([d.id, b.id]), new Set(), []).map((u) => u.id);
    expect(ids).toEqual([b.id, d.id, a.id, c.id]);
  });

  it('moves skipped units to the end in skipped order', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 0, 1);
    const b = addUnit(s, 'army', 0, 1, 1);
    const c = addUnit(s, 'army', 0, 1, 0);
    const d = addUnit(s, 'army', 0, 2, 1);
    const ids = readyUnits(s.units, new Set([b.id]), new Set(), [d.id, b.id, a.id]).map((u) => u.id);
    expect(ids).toEqual([c.id, d.id, b.id, a.id]);
  });

  it('ignores skipped ids that are not ready', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 0, 1);
    const ids = readyUnits(s.units, new Set(), new Set(), [999, a.id]).map((u) => u.id);
    expect(ids).toEqual([a.id]);
  });
});

describe('builtThisTurn', () => {
  it('collects the units produced on the given turn only', () => {
    const entries: LogEntry[] = [
      { turn: 3, event: { type: 'unitProduced', unitId: 7, cityId: 0, unitType: 'army' } },
      { turn: 3, event: { type: 'turnStarted', player: 0, turn: 3 } },
      { turn: 2, event: { type: 'unitProduced', unitId: 5, cityId: 0, unitType: 'army' } },
      { turn: 3, event: { type: 'unitProduced', unitId: 9, cityId: 1, unitType: 'fighter' } },
    ];
    expect([...builtThisTurn(entries, 3)].sort((a, b) => a - b)).toEqual([7, 9]);
    expect(builtThisTurn(entries, 4).size).toBe(0);
  });
});
