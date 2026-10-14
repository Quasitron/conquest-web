import { describe, it, expect } from 'vitest';
import { moveUnit } from '../../src/engine/movement';
import { cargoOf } from '../../src/engine/query';
import { Rng } from '../../src/engine/rng';
import type { GameEvent } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];
const rng = new Rng(1);

describe('basic movement', () => {
  it('moves one square and spends a move', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    const events: GameEvent[] = [];
    expect(moveUnit(s, rng, a, 2, events)).toBeNull();
    expect(a).toMatchObject({ x: 2, y: 1, movesLeft: 0, movedThisTurn: true });
    expect(events).toEqual([{ type: 'unitMoved', unitId: a.id, from: { x: 1, y: 1 }, to: { x: 2, y: 1 } }]);
  });

  it('rejects moving with no moves left or off the map', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1, { movesLeft: 0 });
    expect(moveUnit(s, rng, a, 2, [])).toBeTruthy();
    const b = addUnit(s, 'army', 0, 0, 1);
    expect(moveUnit(s, rng, b, 6, [])).toBeTruthy();
  });

  it('keeps land units on land and ships on water', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 2, 1);
    expect(moveUnit(s, rng, a, 2, [])).toBeTruthy();
    const d = addUnit(s, 'destroyer', 0, 3, 1);
    expect(moveUnit(s, rng, d, 6, [])).toBeTruthy();
  });

  it('lets ships enter a friendly city', () => {
    const s = makeGame(M);
    s.cities[2].owner = 0;
    const d = addUnit(s, 'destroyer', 0, 3, 1);
    expect(moveUnit(s, rng, d, 5, [])).toBeNull();
    expect(d).toMatchObject({ x: 2, y: 2 });
  });

  it('forbids stacking except in friendly cities', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 1, 1);
    const b = addUnit(s, 'army', 0, 1, 2);
    expect(moveUnit(s, rng, b, 0, [])).toBe('square is occupied');
    addUnit(s, 'army', 0, 0, 0);
    const c = addUnit(s, 'army', 0, 1, 0);
    expect(moveUnit(s, rng, c, 6, [])).toBeNull();
  });

  it('wraps across the east-west seam', () => {
    const s = makeGame(M, { wrap: true });
    const a = addUnit(s, 'army', 0, 0, 1);
    expect(moveUnit(s, rng, a, 6, [])).toBeNull();
    expect(a).toMatchObject({ x: 6, y: 1 });
  });
});

describe('transports', () => {
  it('an army boards a transport, rides along, then steps off onto land', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 1);
    const a = addUnit(s, 'army', 0, 2, 1);
    expect(moveUnit(s, rng, a, 2, [])).toBeNull();
    expect(a.carriedBy).toBe(t.id);
    a.movesLeft = 1;
    expect(moveUnit(s, rng, t, 0, [])).toBeNull();
    expect(a).toMatchObject({ x: 3, y: 0 });
    expect(moveUnit(s, rng, a, 6, [])).toBeNull();
    expect(a).toMatchObject({ x: 2, y: 0, carriedBy: null });
  });

  it('holds at most six armies', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 1);
    for (let i = 0; i < 6; i++) addUnit(s, 'army', 0, 3, 1, { carriedBy: t.id });
    const a = addUnit(s, 'army', 0, 2, 1);
    expect(moveUnit(s, rng, a, 2, [])).toBeTruthy();
    expect(cargoOf(s, t)).toHaveLength(6);
  });

  it('auto-loads armies when leaving a friendly city and unloads when entering one', () => {
    const s = makeGame(M);
    s.cities[2].owner = 0;
    const t = addUnit(s, 'transport', 0, 2, 2);
    addUnit(s, 'army', 0, 2, 2);
    addUnit(s, 'army', 0, 2, 2);
    expect(moveUnit(s, rng, t, 2, [])).toBeNull();
    expect(cargoOf(s, t)).toHaveLength(2);
    expect(cargoOf(s, t).every((a) => a.x === 3 && a.y === 2)).toBe(true);
    expect(moveUnit(s, rng, t, 6, [])).toBeNull();
    expect(cargoOf(s, t)).toHaveLength(0);
  });
});

describe('aircraft', () => {
  it('burns one fuel per square', () => {
    const s = makeGame(M);
    const f = addUnit(s, 'fighter', 0, 3, 1);
    expect(moveUnit(s, rng, f, 2, [])).toBeNull();
    expect(f).toMatchObject({ fuel: 19, movesLeft: 4 });
  });

  it('lands and refuels in a friendly city, even on its last fuel', () => {
    const s = makeGame(M);
    const f = addUnit(s, 'fighter', 0, 1, 1, { fuel: 1 });
    expect(moveUnit(s, rng, f, 7, [])).toBeNull();
    expect(s.units).toContain(f);
    expect(f).toMatchObject({ x: 0, y: 0, fuel: 20, movesLeft: 0 });
  });

  it('crashes when fuel runs out away from a refuel point', () => {
    const s = makeGame(M);
    const f = addUnit(s, 'fighter', 0, 3, 1, { fuel: 1 });
    const events: GameEvent[] = [];
    expect(moveUnit(s, rng, f, 2, events)).toBeNull();
    expect(s.units).not.toContain(f);
    expect(events.at(-1)).toMatchObject({ type: 'unitDestroyed', reason: 'crashed' });
  });

  it('lands on a friendly carrier', () => {
    const s = makeGame(M);
    const c = addUnit(s, 'carrier', 0, 4, 1);
    const f = addUnit(s, 'fighter', 0, 3, 1, { fuel: 10 });
    expect(moveUnit(s, rng, f, 2, [])).toBeNull();
    expect(f).toMatchObject({ carriedBy: c.id, fuel: 20, movesLeft: 0 });
  });

  it('may pass over a friendly unit only if it can keep moving', () => {
    const s = makeGame(M);
    addUnit(s, 'destroyer', 0, 4, 1);
    const f = addUnit(s, 'fighter', 0, 3, 1);
    expect(moveUnit(s, rng, f, 2, [])).toBeNull();
    const g = addUnit(s, 'fighter', 0, 5, 0, { movesLeft: 1 });
    expect(moveUnit(s, rng, g, 5, [])).toBe('square is occupied');
  });
});
